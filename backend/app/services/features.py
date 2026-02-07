from __future__ import annotations

import math
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from app.db import now_utc_iso
from app.services.beliefs import implied_yes_price, infer_wallet_belief, yes_direction


def _parse_iso(ts: str) -> datetime:
    raw = ts
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _safe_log_loss(prob: float, outcome: int) -> float:
    p = min(0.999, max(0.001, prob))
    return -(outcome * math.log(p) + (1 - outcome) * math.log(1 - p))


def _horizon_bucket(end_time: datetime, ref_time: datetime) -> str:
    delta_hours = (end_time - ref_time).total_seconds() / 3600.0
    if delta_hours <= 24:
        return "intraday"
    if delta_hours <= 7 * 24:
        return "short"
    if delta_hours <= 30 * 24:
        return "medium"
    return "long"


@dataclass
class MetricAccum:
    market_count: int = 0
    trade_count: int = 0
    sum_brier: float = 0.0
    sum_log_loss: float = 0.0
    sum_belief: float = 0.0
    sum_outcome: float = 0.0
    sum_trade_size: float = 0.0
    sum_churn: float = 0.0
    sum_persistence: float = 0.0
    sum_timing_edge: float = 0.0
    sum_pnl: float = 0.0
    sum_cost: float = 0.0


def _compute_market_final_yes(conn: sqlite3.Connection) -> dict[str, float]:
    rows = conn.execute(
        """
        SELECT t.market_id, t.side, t.price, t.ts, o.resolution_time
        FROM trades t
        JOIN outcomes o ON o.market_id = t.market_id
        ORDER BY t.market_id, t.ts
        """
    ).fetchall()
    final_yes: dict[str, float] = {}
    for row in rows:
        market_id = row["market_id"]
        ts = _parse_iso(row["ts"])
        resolution_ts = _parse_iso(row["resolution_time"])
        if ts <= resolution_ts:
            final_yes[market_id] = implied_yes_price(row["side"], float(row["price"]))
    return final_yes


def compute_wallet_metrics(conn: sqlite3.Connection) -> dict[str, int]:
    final_yes_price = _compute_market_final_yes(conn)
    rows = conn.execute(
        """
        SELECT
          t.market_id,
          t.wallet,
          t.ts,
          t.side,
          t.action,
          t.price,
          t.size,
          m.category,
          m.end_time,
          o.resolved_outcome,
          o.resolution_time
        FROM trades t
        JOIN markets m ON m.id = t.market_id
        JOIN outcomes o ON o.market_id = t.market_id
        ORDER BY t.market_id, t.wallet, t.ts
        """
    ).fetchall()

    grouped: dict[tuple[str, str], list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        grouped[(row["market_id"], row["wallet"])].append(row)

    wallet_category_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for (market_id, wallet), market_rows in grouped.items():
        category = (market_rows[0]["category"] or "unknown").lower()
        if market_rows:
            wallet_category_counts[wallet][category] += 1

    wallet_specialization: dict[str, float] = {}
    for wallet, counts in wallet_category_counts.items():
        total = sum(counts.values())
        if total == 0 or len(counts) <= 1:
            wallet_specialization[wallet] = 1.0
            continue
        entropy = 0.0
        for c in counts.values():
            p = c / total
            entropy -= p * math.log(p)
        max_entropy = math.log(len(counts))
        wallet_specialization[wallet] = 1.0 - (entropy / max_entropy if max_entropy > 0 else 0.0)

    accums: dict[tuple[str, str, str], MetricAccum] = defaultdict(MetricAccum)

    for (market_id, wallet), market_rows in grouped.items():
        first_trade_time = _parse_iso(market_rows[0]["ts"])
        end_time = _parse_iso(market_rows[0]["end_time"])
        resolution_time = _parse_iso(market_rows[0]["resolution_time"])
        cutoff = min(end_time, resolution_time)
        category = (market_rows[0]["category"] or "unknown").lower()
        horizon = _horizon_bucket(end_time, first_trade_time)
        outcome = int(market_rows[0]["resolved_outcome"])

        belief_snapshot = infer_wallet_belief(market_rows, as_of=cutoff)
        belief = float(belief_snapshot["belief"])
        churn = float(belief_snapshot["churn"])
        persistence = float(belief_snapshot["persistence"])

        brier = (belief - outcome) ** 2
        log_loss = _safe_log_loss(belief, outcome)

        timing_signals: list[float] = []
        final_yes = final_yes_price.get(market_id)
        for tr in market_rows:
            side = tr["side"]
            action = tr["action"]
            price = float(tr["price"])
            size = float(tr["size"])
            direction = yes_direction(side, action)
            current_yes = implied_yes_price(side, price)
            if final_yes is not None:
                move = final_yes - current_yes
                if abs(move) > 0.005:
                    timing_signals.append(1.0 if direction * move > 0 else 0.0)

        timing_edge = 0.0
        if timing_signals:
            timing_edge = 2.0 * (sum(timing_signals) / len(timing_signals)) - 1.0

        pnl = 0.0
        cost = 0.0
        for tr in market_rows:
            side = tr["side"]
            action = tr["action"]
            px = float(tr["price"])
            size = float(tr["size"])
            token_value = outcome if side == "YES" else (1 - outcome)
            if action == "BUY":
                pnl += (token_value - px) * size
            else:
                pnl += (px - token_value) * size
            cost += max(px * size, 1e-9)

        keys = [
            (wallet, "ALL", "ALL"),
            (wallet, category, "ALL"),
            (wallet, "ALL", horizon),
            (wallet, category, horizon),
        ]
        total_trade_size = sum(float(tr["size"]) for tr in market_rows)
        for key in keys:
            a = accums[key]
            a.market_count += 1
            a.trade_count += len(market_rows)
            a.sum_brier += brier
            a.sum_log_loss += log_loss
            a.sum_belief += belief
            a.sum_outcome += outcome
            a.sum_trade_size += total_trade_size
            a.sum_churn += churn
            a.sum_persistence += persistence
            a.sum_timing_edge += timing_edge
            a.sum_pnl += pnl
            a.sum_cost += cost

    conn.execute("DELETE FROM wallet_metrics")
    payload: list[tuple] = []
    for (wallet, category, horizon), a in accums.items():
        if a.market_count == 0 or a.trade_count == 0:
            continue
        n = a.market_count
        avg_brier = a.sum_brier / n
        avg_log_loss = a.sum_log_loss / n
        calibration_error = abs((a.sum_belief / n) - (a.sum_outcome / n))
        roi = a.sum_pnl / max(a.sum_cost, 1e-9)
        avg_trade_size = a.sum_trade_size / a.trade_count
        churn = a.sum_churn / n
        persistence = a.sum_persistence / n
        timing_edge = a.sum_timing_edge / n
        specialization = wallet_specialization.get(wallet, 0.0)
        payload.append(
            (
                wallet,
                category,
                horizon,
                a.market_count,
                a.trade_count,
                avg_brier,
                avg_log_loss,
                roi,
                calibration_error,
                avg_trade_size,
                churn,
                persistence,
                specialization,
                timing_edge,
                now_utc_iso(),
            )
        )

    conn.executemany(
        """
        INSERT INTO wallet_metrics (
          wallet, category, horizon_bucket, sample_markets, sample_trades, brier, log_loss, roi,
          calibration_error, avg_trade_size, churn, persistence, specialization, timing_edge, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        payload,
    )
    return {"wallet_metric_rows": len(payload)}

