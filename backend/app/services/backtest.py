from __future__ import annotations

import json
import math
import sqlite3
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.db import now_utc_iso
from app.services.smartcrowd import build_market_snapshot


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
            output.append({"bucket": name, "count": 0, "smart_better_rate": None})
            continue
        better = 0
        for r in subset:
            smart_err = abs(r["smartcrowd_prob"] - r["outcome"])
            market_err = abs(r["market_prob"] - r["outcome"])
            if smart_err < market_err:
                better += 1
        output.append(
            {
                "bucket": name,
                "count": len(subset),
                "smart_better_rate": better / len(subset),
            }
        )
    return output


def run_backtest(conn: sqlite3.Connection, cutoff_hours: float = 12.0, run_id: str | None = None) -> dict:
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
            continue

        snap = build_market_snapshot(conn, market_id, snapshot_time=cutoff_dt, persist=False)
        record = {
            "market_id": market_id,
            "cutoff_time": cutoff_dt.isoformat(),
            "market_prob": float(snap["market_prob"]),
            "smartcrowd_prob": float(snap["smartcrowd_prob"]),
            "outcome": outcome,
            "confidence": float(snap["confidence"]),
            "divergence": float(snap["divergence"]),
        }
        records.append(record)
        conn.execute(
            """
            INSERT INTO market_backtests (
              run_id, market_id, cutoff_time, market_prob, smartcrowd_prob, outcome, confidence, divergence
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                record["market_id"],
                record["cutoff_time"],
                record["market_prob"],
                record["smartcrowd_prob"],
                record["outcome"],
                record["confidence"],
                record["divergence"],
            ),
        )

    if not records:
        summary = {
            "run_id": run_id,
            "generated_at": now_utc_iso(),
            "markets_evaluated": 0,
            "note": "No eligible resolved markets with data before cutoff.",
        }
    else:
        market_probs = [r["market_prob"] for r in records]
        smart_probs = [r["smartcrowd_prob"] for r in records]
        outcomes = [r["outcome"] for r in records]

        brier_market = sum((p - y) ** 2 for p, y in zip(market_probs, outcomes)) / len(records)
        brier_smart = sum((p - y) ** 2 for p, y in zip(smart_probs, outcomes)) / len(records)
        ll_market = sum(_log_loss(p, y) for p, y in zip(market_probs, outcomes)) / len(records)
        ll_smart = sum(_log_loss(p, y) for p, y in zip(smart_probs, outcomes)) / len(records)
        edge_buckets = _edge_bucket_stats(records)

        top_cases = sorted(records, key=lambda r: abs(r["divergence"]), reverse=True)[:8]
        for case in top_cases:
            case["smart_abs_error"] = abs(case["smartcrowd_prob"] - case["outcome"])
            case["market_abs_error"] = abs(case["market_prob"] - case["outcome"])
            case["winner"] = (
                "smartcrowd"
                if case["smart_abs_error"] < case["market_abs_error"]
                else ("market" if case["smart_abs_error"] > case["market_abs_error"] else "tie")
            )

        summary = {
            "run_id": run_id,
            "generated_at": now_utc_iso(),
            "markets_evaluated": len(records),
            "brier": {"market": brier_market, "smartcrowd": brier_smart},
            "log_loss": {"market": ll_market, "smartcrowd": ll_smart},
            "delta": {
                "brier_improvement": brier_market - brier_smart,
                "log_loss_improvement": ll_market - ll_smart,
            },
            "calibration": {
                "market": _calibration_bins(market_probs, outcomes),
                "smartcrowd": _calibration_bins(smart_probs, outcomes),
            },
            "edge_buckets": edge_buckets,
            "top_divergence_cases": top_cases,
        }

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

