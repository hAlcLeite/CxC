from __future__ import annotations

import math
import sqlite3
from datetime import datetime, timezone
from typing import Iterable

from app.config import RECENCY_HALF_LIFE_HOURS


def _parse_iso(ts: str) -> datetime:
    raw = ts
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def implied_yes_price(side: str, price: float) -> float:
    return clamp(price if side == "YES" else (1.0 - price), 0.001, 0.999)


def yes_direction(side: str, action: str) -> int:
    # Direction of YES exposure change.
    action_sign = 1 if action == "BUY" else -1
    return action_sign if side == "YES" else -action_sign


def infer_wallet_belief(
    trades: Iterable[sqlite3.Row],
    as_of: datetime | None = None,
    half_life_hours: float = RECENCY_HALF_LIFE_HOURS,
) -> dict[str, float]:
    trades_sorted = sorted(trades, key=lambda r: r["ts"])
    if not trades_sorted:
        return {
            "belief": 0.5,
            "confidence": 0.0,
            "trade_count": 0,
            "churn": 1.0,
            "persistence": 0.0,
            "avg_size": 0.0,
            "net_direction": 0.0,
        }

    cutoff = as_of or _parse_iso(trades_sorted[-1]["ts"])
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=timezone.utc)
    cutoff = cutoff.astimezone(timezone.utc)

    weighted_belief = 0.0
    total_weight = 0.0
    weighted_direction = 0.0
    flips = 0
    prev_direction: int | None = None
    streak = 0
    sizes: list[float] = []
    considered = 0

    for row in trades_sorted:
        trade_time = _parse_iso(row["ts"])
        if trade_time > cutoff:
            continue

        side = row["side"]
        action = row["action"]
        size = float(row["size"])
        price = float(row["price"])

        direction = yes_direction(side, action)
        yes_px = implied_yes_price(side, price)
        vote = (yes_px + 1.0) / 2.0 if direction > 0 else yes_px / 2.0

        age_hours = max(0.0, (cutoff - trade_time).total_seconds() / 3600.0)
        recency = math.exp(-math.log(2) * age_hours / max(half_life_hours, 1e-6))
        size_weight = math.sqrt(max(size, 1e-9))

        if prev_direction is None or prev_direction != direction:
            if prev_direction is not None:
                flips += 1
            streak = 1
        else:
            streak += 1
        prev_direction = direction

        persistence_boost = 1.0 + 0.12 * min(streak - 1, 4)
        weight = size_weight * recency * persistence_boost

        weighted_belief += weight * vote
        total_weight += weight
        weighted_direction += weight * direction
        sizes.append(size)
        considered += 1

    if considered == 0 or total_weight <= 0:
        return {
            "belief": 0.5,
            "confidence": 0.0,
            "trade_count": 0,
            "churn": 1.0,
            "persistence": 0.0,
            "avg_size": 0.0,
            "net_direction": 0.0,
        }

    belief = clamp(weighted_belief / total_weight, 0.001, 0.999)
    churn = flips / max(1, considered - 1)
    persistence = 1.0 - churn
    signal_mass = total_weight / (total_weight + 6.0)
    sample_support = 0.3 + 0.7 * min(1.0, considered / 6.0)
    confidence = clamp(signal_mass * sample_support * (0.5 + 0.5 * persistence), 0.0, 1.0)

    return {
        "belief": belief,
        "confidence": confidence,
        "trade_count": float(considered),
        "churn": churn,
        "persistence": persistence,
        "avg_size": sum(sizes) / len(sizes),
        "net_direction": weighted_direction / total_weight,
    }


def load_market_wallet_trades(
    conn: sqlite3.Connection, market_id: str, snapshot_time: datetime | None = None
) -> dict[str, list[sqlite3.Row]]:
    if snapshot_time is None:
        rows = conn.execute(
            """
            SELECT wallet, ts, side, action, price, size
            FROM trades
            WHERE market_id = ?
            ORDER BY wallet, ts
            """,
            (market_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT wallet, ts, side, action, price, size
            FROM trades
            WHERE market_id = ? AND ts <= ?
            ORDER BY wallet, ts
            """,
            (market_id, snapshot_time.astimezone(timezone.utc).isoformat()),
        ).fetchall()

    by_wallet: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        by_wallet.setdefault(row["wallet"], []).append(row)
    return by_wallet

