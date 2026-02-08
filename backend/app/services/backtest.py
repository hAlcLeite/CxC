from __future__ import annotations

import json
import logging
import math
import sqlite3
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.db import now_utc_iso

LOGGER = logging.getLogger("smartcrowd.backtest")
from app.services.precognition import build_market_snapshot


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _log_loss(prob: float, outcome: int) -> float:
    p = clamp(prob, 0.001, 0.999)
    return -(outcome * math.log(p) + (1 - outcome) * math.log(1 - p))


def _parse_iso(ts: str) -> datetime:
    raw = ts
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _calibration_bins(probs: list[float], outcomes: list[int], bins: int = 10) -> list[dict]:
    grouped: dict[int, list[tuple[float, int]]] = defaultdict(list)
    for p, y in zip(probs, outcomes):
        idx = min(bins - 1, int(p * bins))
        grouped[idx].append((p, y))
    result = []
    for i in range(bins):
        entries = grouped.get(i, [])
        if not entries:
            result.append(
                {
                    "bin": i,
                    "count": 0,
                    "avg_prob": None,
                    "empirical": None,
                }
            )
            continue
        avg_prob = sum(x[0] for x in entries) / len(entries)
        empirical = sum(x[1] for x in entries) / len(entries)
        result.append(
            {
                "bin": i,
                "count": len(entries),
                "avg_prob": avg_prob,
                "empirical": empirical,
            }
        )
    return result


def _edge_bucket_stats(records: list[dict]) -> list[dict]:
    buckets = [
        (0.00, 0.02, "0-2%"),
        (0.02, 0.05, "2-5%"),
        (0.05, 0.10, "5-10%"),
        (0.10, 1.01, "10%+"),
    ]
    output = []
    for low, high, name in buckets:
        subset = [r for r in records if low <= abs(r["divergence"]) < high]
        if not subset:
            output.append({"bucket": name, "count": 0, "avg_edge": 0, "avg_pnl": 0, "win_rate": 0})
            continue
        better = 0
        total_edge = 0.0
        total_pnl = 0.0
        for r in subset:
            smart_err = abs(r["precognition_prob"] - r["outcome"])
            market_err = abs(r["market_prob"] - r["outcome"])
            total_edge += market_err - smart_err
            total_pnl += market_err - smart_err
            if smart_err < market_err:
                better += 1
        output.append(
            {
                "bucket": name,
                "count": len(subset),
                "avg_edge": total_edge / len(subset),
                "avg_pnl": total_pnl / len(subset),
                "win_rate": better / len(subset),
            }
        )
    return output


def _evaluate_market_at_cutoff(
    conn: sqlite3.Connection,
    market_id: str,
    end_time: datetime,
    resolution_time: datetime,
    outcome: int,
    cutoff_hours: float,
) -> dict | None:
    """Evaluate a single market at the given cutoff. Returns a record dict or None if ineligible."""
    cutoff_dt = min(end_time, resolution_time) - timedelta(hours=cutoff_hours)
    if cutoff_dt > datetime.now(timezone.utc):
        cutoff_dt = datetime.now(timezone.utc)

    first_trade = conn.execute(
        """
        SELECT ts
        FROM trades
        WHERE market_id = ? AND ts <= ?
        ORDER BY ts ASC
        LIMIT 1
        """,
        (market_id, cutoff_dt.isoformat()),
    ).fetchone()
    if not first_trade:
        return None

    # Skip markets whose trading window is shorter than the cutoff —
    # there isn't enough pre-cutoff data for a meaningful evaluation.
    first_trade_dt = _parse_iso(first_trade["ts"])
    trading_window = min(end_time, resolution_time) - first_trade_dt
    if trading_window < timedelta(hours=cutoff_hours):
        return None

    snap = build_market_snapshot(conn, market_id, snapshot_time=cutoff_dt, persist=False)
    return {
        "market_id": market_id,
        "cutoff_time": cutoff_dt.isoformat(),
        "market_prob": float(snap["market_prob"]),
        "precognition_prob": float(snap["precognition_prob"]),
        "outcome": outcome,
        "confidence": float(snap["confidence"]),
        "divergence": float(snap["divergence"]),
    }


def _compute_summary(records: list[dict], cutoff_hours: float, run_id: str) -> dict:
    """Compute aggregated backtest summary from evaluated records."""
    if not records:
        return {
            "run_id": run_id,
            "cutoff_hours": cutoff_hours,
            "evaluated_at": now_utc_iso(),
            "total_markets": 0,
            "note": "No eligible resolved markets with data before cutoff.",
        }

    market_probs = [r["market_prob"] for r in records]
    smart_probs = [r["precognition_prob"] for r in records]
    outcomes = [r["outcome"] for r in records]

    brier_market = sum((p - y) ** 2 for p, y in zip(market_probs, outcomes)) / len(records)
    brier_smart = sum((p - y) ** 2 for p, y in zip(smart_probs, outcomes)) / len(records)
    ll_market = sum(_log_loss(p, y) for p, y in zip(market_probs, outcomes)) / len(records)
    ll_smart = sum(_log_loss(p, y) for p, y in zip(smart_probs, outcomes)) / len(records)
    edge_buckets = _edge_bucket_stats(records)

    top_cases = sorted(records, key=lambda r: abs(r["divergence"]), reverse=True)[:8]
    for case in top_cases:
        case["smart_abs_error"] = abs(case["precognition_prob"] - case["outcome"])
        case["market_abs_error"] = abs(case["market_prob"] - case["outcome"])
        case["winner"] = (
            "Precognition"
            if case["smart_abs_error"] < case["market_abs_error"]
            else ("market" if case["smart_abs_error"] > case["market_abs_error"] else "tie")
        )

    return {
        "run_id": run_id,
        "cutoff_hours": cutoff_hours,
        "evaluated_at": now_utc_iso(),
        "total_markets": len(records),
        "precognition_brier": brier_smart,
        "market_brier": brier_market,
        "brier_improvement": brier_market - brier_smart,
        "log_loss": {"market": ll_market, "Precognition": ll_smart},
        "calibration": {
            "market": _calibration_bins(market_probs, outcomes),
            "Precognition": _calibration_bins(smart_probs, outcomes),
        },
        "edge_buckets": edge_buckets,
        "top_divergence_cases": top_cases,
    }


def run_backtest(conn: sqlite3.Connection, cutoff_hours: float = 1.0, run_id: str | None = None) -> dict:
    if run_id is None:
        run_id = uuid.uuid4().hex
    conn.execute("DELETE FROM market_backtests WHERE run_id = ?", (run_id,))

    markets = conn.execute(
        """
        SELECT m.id, m.end_time, o.resolution_time, o.resolved_outcome
        FROM markets m
        JOIN outcomes o ON o.market_id = m.id
        """
    ).fetchall()

    records: list[dict] = []
    for row in markets:
        market_id = row["id"]
        end_time = _parse_iso(row["end_time"])
        resolution_time = _parse_iso(row["resolution_time"])
        outcome = int(row["resolved_outcome"])

        record = _evaluate_market_at_cutoff(conn, market_id, end_time, resolution_time, outcome, cutoff_hours)
        if record is None:
            continue
        records.append(record)
        conn.execute(
            """
            INSERT INTO market_backtests (
              run_id, market_id, cutoff_time, market_prob, precognition_prob, outcome, confidence, divergence
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                record["market_id"],
                record["cutoff_time"],
                record["market_prob"],
                record["precognition_prob"],
                record["outcome"],
                record["confidence"],
                record["divergence"],
            ),
        )

    LOGGER.info(
        "backtest: cutoff_hours=%.2f, resolved_markets=%d, eligible_after_filters=%d",
        cutoff_hours, len(markets), len(records),
    )

    summary = _compute_summary(records, cutoff_hours, run_id)

    LOGGER.info("backtest_summary: %s", json.dumps(summary, default=str))

    conn.execute(
        """
        INSERT INTO backtest_reports (run_id, generated_at, summary_json)
        VALUES (?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          generated_at = excluded.generated_at,
          summary_json = excluded.summary_json
        """,
        (run_id, now_utc_iso(), json.dumps(summary)),
    )
    return summary


def run_backtest_sweep(conn: sqlite3.Connection, max_hours: int = 168) -> dict:
    """Run backtests at every hour from 1 to max_hours, returning lightweight summaries."""
    sweep_run_id = uuid.uuid4().hex

    # Fetch resolved markets once
    markets = conn.execute(
        """
        SELECT m.id, m.end_time, o.resolution_time, o.resolved_outcome
        FROM markets m
        JOIN outcomes o ON o.market_id = m.id
        """
    ).fetchall()

    # Pre-parse timestamps
    parsed_markets = []
    for row in markets:
        parsed_markets.append({
            "market_id": row["id"],
            "end_time": _parse_iso(row["end_time"]),
            "resolution_time": _parse_iso(row["resolution_time"]),
            "outcome": int(row["resolved_outcome"]),
        })

    hourly_results: list[dict] = []

    for cutoff_h in range(1, max_hours + 1):
        records: list[dict] = []
        for m in parsed_markets:
            record = _evaluate_market_at_cutoff(
                conn, m["market_id"], m["end_time"], m["resolution_time"], m["outcome"], float(cutoff_h)
            )
            if record is not None:
                records.append(record)

        if not records:
            hourly_results.append({"cutoff_hours": cutoff_h, "total_markets": 0})
            break

        market_probs = [r["market_prob"] for r in records]
        smart_probs = [r["precognition_prob"] for r in records]
        outcomes = [r["outcome"] for r in records]

        brier_market = sum((p - y) ** 2 for p, y in zip(market_probs, outcomes)) / len(records)
        brier_smart = sum((p - y) ** 2 for p, y in zip(smart_probs, outcomes)) / len(records)
        brier_improvement = brier_market - brier_smart
        brier_improvement_pct = (brier_improvement / brier_market * 100) if brier_market > 0 else 0.0

        hourly_results.append({
            "cutoff_hours": cutoff_h,
            "total_markets": len(records),
            "precognition_brier": round(brier_smart, 6),
            "market_brier": round(brier_market, 6),
            "brier_improvement": round(brier_improvement, 6),
            "brier_improvement_pct": round(brier_improvement_pct, 2),
            "edge_buckets": _edge_bucket_stats(records),
        })

    return {
        "run_id": sweep_run_id,
        "max_hours": max_hours,
        "evaluated_at": now_utc_iso(),
        "total_resolved_markets": len(parsed_markets),
        "hours_evaluated": len(hourly_results),
        "hourly_results": hourly_results,
    }

