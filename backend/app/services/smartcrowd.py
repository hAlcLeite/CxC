from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timezone

from app.db import now_utc_iso
from app.services.beliefs import implied_yes_price, infer_wallet_belief, load_market_wallet_trades
from app.services.features import _horizon_bucket, _parse_iso


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _market_prob_at(conn: sqlite3.Connection, market_id: str, snapshot_time: datetime) -> float:
    row = conn.execute(
        """
        SELECT side, price
        FROM trades
        WHERE market_id = ? AND ts <= ?
        ORDER BY ts DESC
        LIMIT 1
        """,
        (market_id, snapshot_time.astimezone(timezone.utc).isoformat()),
    ).fetchone()
    if not row:
        return 0.5
    return implied_yes_price(row["side"], float(row["price"]))


def _lookup_wallet_weight(
    conn: sqlite3.Connection, wallet: str, category: str, horizon_bucket: str
) -> tuple[float, float]:
    lookup_order = [
        (wallet, category, horizon_bucket),
        (wallet, category, "ALL"),
        (wallet, "ALL", horizon_bucket),
        (wallet, "ALL", "ALL"),
    ]
    for key in lookup_order:
        row = conn.execute(
            """
            SELECT weight, uncertainty
            FROM wallet_weights
            WHERE wallet = ? AND category = ? AND horizon_bucket = ?
            """,
            key,
        ).fetchone()
        if row:
            return float(row["weight"]), float(row["uncertainty"])
    return 1.0, 1.0


def build_market_snapshot(
    conn: sqlite3.Connection,
    market_id: str,
    snapshot_time: datetime | None = None,
    persist: bool = True,
) -> dict:
    snapshot_dt = snapshot_time or datetime.now(timezone.utc)
    if snapshot_dt.tzinfo is None:
        snapshot_dt = snapshot_dt.replace(tzinfo=timezone.utc)
    snapshot_dt = snapshot_dt.astimezone(timezone.utc)

    market = conn.execute(
        """
        SELECT id, question, category, end_time, liquidity
        FROM markets
        WHERE id = ?
        """,
        (market_id,),
    ).fetchone()
    if not market:
        raise ValueError(f"Market does not exist: {market_id}")

    category = (market["category"] or "unknown").lower()
    end_time = _parse_iso(market["end_time"])
    horizon_bucket = _horizon_bucket(end_time, snapshot_dt)
    market_prob = _market_prob_at(conn, market_id, snapshot_dt)

    wallet_trades = load_market_wallet_trades(conn, market_id, snapshot_dt)
    wallet_signals: list[dict] = []
    for wallet, trades in wallet_trades.items():
        signal = infer_wallet_belief(trades, as_of=snapshot_dt)
        confidence = float(signal["confidence"])
        if confidence <= 0:
            continue
        weight, uncertainty = _lookup_wallet_weight(conn, wallet, category, horizon_bucket)
        churn = float(signal["churn"])
        persistence = float(signal["persistence"])
        anti_noise = max(0.40, 1.0 - 0.55 * churn) * (0.85 + 0.30 * persistence)
        trust_weight = weight * anti_noise * max(0.40, 1.0 - uncertainty * 0.30)
        effective_weight = trust_weight * confidence
        if effective_weight <= 0:
            continue
        wallet_signals.append(
            {
                "wallet": wallet,
                "belief": float(signal["belief"]),
                "confidence": confidence,
                "weight": trust_weight,
                "effective_weight": effective_weight,
                "churn": churn,
            }
        )

    if not wallet_signals:
        result = {
            "market_id": market_id,
            "snapshot_time": snapshot_dt.isoformat(),
            "market_prob": market_prob,
            "smartcrowd_prob": market_prob,
            "divergence": 0.0,
            "confidence": 0.0,
            "disagreement": 0.0,
            "participation_quality": 0.0,
            "integrity_risk": 1.0,
            "active_wallets": 0,
            "top_drivers": [],
        }
        if persist:
            conn.execute(
                """
                INSERT INTO smartcrowd_snapshots (
                  market_id, snapshot_time, market_prob, smartcrowd_prob, divergence, confidence,
                  disagreement, participation_quality, integrity_risk, active_wallets, top_drivers
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(market_id, snapshot_time) DO UPDATE SET
                  market_prob = excluded.market_prob,
                  smartcrowd_prob = excluded.smartcrowd_prob,
                  divergence = excluded.divergence,
                  confidence = excluded.confidence,
                  disagreement = excluded.disagreement,
                  participation_quality = excluded.participation_quality,
                  integrity_risk = excluded.integrity_risk,
                  active_wallets = excluded.active_wallets,
                  top_drivers = excluded.top_drivers
                """,
                (
                    market_id,
                    snapshot_dt.isoformat(),
                    result["market_prob"],
                    result["smartcrowd_prob"],
                    result["divergence"],
                    result["confidence"],
                    result["disagreement"],
                    result["participation_quality"],
                    result["integrity_risk"],
                    result["active_wallets"],
                    json.dumps(result["top_drivers"]),
                ),
            )
        return result

    denominator = sum(sig["effective_weight"] for sig in wallet_signals)
    smartcrowd_prob = sum(sig["effective_weight"] * sig["belief"] for sig in wallet_signals) / max(denominator, 1e-9)
    smartcrowd_prob = clamp(smartcrowd_prob, 0.001, 0.999)

    shares = [sig["effective_weight"] / denominator for sig in wallet_signals]
    disagreement = math.sqrt(
        sum(shares[i] * ((wallet_signals[i]["belief"] - smartcrowd_prob) ** 2) for i in range(len(wallet_signals)))
    )
    herfindahl = sum(s * s for s in shares)
    effective_n = 1.0 / max(herfindahl, 1e-9)
    participation_quality = clamp(effective_n / 12.0, 0.0, 1.0)

    avg_churn = sum(shares[i] * wallet_signals[i]["churn"] for i in range(len(wallet_signals)))
    integrity_risk = clamp(0.55 * herfindahl + 0.45 * avg_churn, 0.0, 1.0)
    signal_support = denominator / (denominator + 10.0)
    agreement = max(0.0, 1.0 - disagreement)
    wallet_count_factor = min(1.0, len(wallet_signals) / 15.0)
    confidence = clamp(signal_support * agreement * wallet_count_factor * (1.0 - 0.70 * integrity_risk), 0.0, 1.0)
    if len(wallet_signals) < 3:
        confidence *= 0.60

    divergence = smartcrowd_prob - market_prob
    top = sorted(
        (
            {
                "wallet": sig["wallet"],
                "belief": round(sig["belief"], 6),
                "confidence": round(sig["confidence"], 6),
                "weight": round(sig["weight"], 6),
                "contribution": round(sig["effective_weight"] * (sig["belief"] - market_prob), 6),
            }
            for sig in wallet_signals
        ),
        key=lambda item: abs(item["contribution"]),
        reverse=True,
    )[:8]

    result = {
        "market_id": market_id,
        "snapshot_time": snapshot_dt.isoformat(),
        "market_prob": market_prob,
        "smartcrowd_prob": smartcrowd_prob,
        "divergence": divergence,
        "confidence": confidence,
        "disagreement": disagreement,
        "participation_quality": participation_quality,
        "integrity_risk": integrity_risk,
        "active_wallets": len(wallet_signals),
        "top_drivers": top,
    }

    if persist:
        conn.execute(
            """
            INSERT INTO smartcrowd_snapshots (
              market_id, snapshot_time, market_prob, smartcrowd_prob, divergence, confidence,
              disagreement, participation_quality, integrity_risk, active_wallets, top_drivers
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(market_id, snapshot_time) DO UPDATE SET
              market_prob = excluded.market_prob,
              smartcrowd_prob = excluded.smartcrowd_prob,
              divergence = excluded.divergence,
              confidence = excluded.confidence,
              disagreement = excluded.disagreement,
              participation_quality = excluded.participation_quality,
              integrity_risk = excluded.integrity_risk,
              active_wallets = excluded.active_wallets,
              top_drivers = excluded.top_drivers
            """,
            (
                market_id,
                snapshot_dt.isoformat(),
                result["market_prob"],
                result["smartcrowd_prob"],
                result["divergence"],
                result["confidence"],
                result["disagreement"],
                result["participation_quality"],
                result["integrity_risk"],
                result["active_wallets"],
                json.dumps(result["top_drivers"]),
            ),
        )

    return result


def build_snapshots_for_all_markets(
    conn: sqlite3.Connection,
    snapshot_time: datetime | None = None,
    include_resolved: bool = False,
) -> dict[str, int]:
    if include_resolved:
        rows = conn.execute("SELECT id FROM markets").fetchall()
    else:
        rows = conn.execute(
            """
            SELECT m.id
            FROM markets m
            LEFT JOIN outcomes o ON o.market_id = m.id
            WHERE o.market_id IS NULL
            """
        ).fetchall()

    created = 0
    for row in rows:
        build_market_snapshot(conn, row["id"], snapshot_time=snapshot_time, persist=True)
        created += 1
    return {"snapshots_written": created}


def latest_screener_rows(
    conn: sqlite3.Connection, limit: int = 25, min_confidence: float = 0.0
) -> list[sqlite3.Row]:
    return conn.execute(
        """
        WITH latest AS (
          SELECT market_id, MAX(snapshot_time) AS snapshot_time
          FROM smartcrowd_snapshots
          GROUP BY market_id
        )
        SELECT
          s.market_id,
          s.snapshot_time,
          s.market_prob,
          s.smartcrowd_prob,
          s.divergence,
          s.confidence,
          s.disagreement,
          s.participation_quality,
          s.integrity_risk,
          s.active_wallets,
          s.top_drivers,
          m.question,
          m.category,
          m.end_time
        FROM smartcrowd_snapshots s
        JOIN latest l
          ON s.market_id = l.market_id
         AND s.snapshot_time = l.snapshot_time
        JOIN markets m
          ON m.id = s.market_id
        WHERE s.confidence >= ?
        ORDER BY ABS(s.divergence) DESC
        LIMIT ?
        """,
        (min_confidence, limit),
    ).fetchall()

