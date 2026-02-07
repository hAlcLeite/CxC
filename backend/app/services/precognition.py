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


def _load_wallet_profiles(conn: sqlite3.Connection, wallets: list[str]) -> dict[str, sqlite3.Row]:
    if not wallets:
        return {}
    placeholders = ",".join("?" for _ in wallets)
    rows = conn.execute(
        f"""
        SELECT wallet, sample_markets, avg_trade_size, churn, persistence, specialization, timing_edge, roi, brier
        FROM wallet_metrics
        WHERE category = 'ALL' AND horizon_bucket = 'ALL' AND wallet IN ({placeholders})
        """,
        wallets,
    ).fetchall()
    return {str(r["wallet"]): r for r in rows}


def _classify_cohort(profile: sqlite3.Row | None, signal: dict) -> str:
    churn = float(signal.get("churn", 0.5))
    confidence = float(signal.get("confidence", 0.0))
    if profile is None:
        if churn > 0.65:
            return "noise_churner"
        if confidence > 0.55:
            return "informed_accumulator"
        return "generalist_flow"

    profile_churn = float(profile["churn"])
    persistence = float(profile["persistence"])
    specialization = float(profile["specialization"])
    timing_edge = float(profile["timing_edge"])
    avg_trade_size = float(profile["avg_trade_size"])
    brier = float(profile["brier"])
    sample_markets = int(profile["sample_markets"])

    if profile_churn > 0.65:
        return "noise_churner"
    if timing_edge > 0.22 and profile_churn < 0.45 and sample_markets >= 5:
        return "timing_specialist"
    if persistence > 0.72 and specialization > 0.45 and sample_markets >= 6:
        return "informed_accumulator"
    if avg_trade_size > 200 and profile_churn < 0.5:
        return "whale_conviction"
    if brier < 0.20 and specialization > 0.40:
        return "category_specialist"
    if profile_churn < 0.35 and abs(float(profile["roi"])) < 0.04:
        return "maker_arb"
    return "generalist_flow"


def _build_flip_conditions(
    market_prob: float,
    precognition_prob: float,
    denominator: float,
    divergence: float,
    cohort_summary: list[dict],
) -> list[dict]:
    if abs(divergence) < 1e-12 or denominator <= 0:
        return [
            {
                "condition": "signal_aligned_with_market",
                "detail": "Precognition is currently aligned with market implied probability.",
            }
        ]

    conditions: list[dict] = []
    if divergence > 0:
        if market_prob > 0:
            needed = denominator * (precognition_prob - market_prob) / market_prob
            conditions.append(
                {
                    "condition": "trusted_no_flow_needed",
                    "detail": (
                        f"Approximately {needed:.3f} additional effective NO-side weight at extreme conviction "
                        f"is needed to cross below market."
                    ),
                    "required_effective_weight": max(0.0, needed),
                }
            )
    else:
        if market_prob < 1:
            needed = denominator * (market_prob - precognition_prob) / (1.0 - market_prob)
            conditions.append(
                {
                    "condition": "trusted_yes_flow_needed",
                    "detail": (
                        f"Approximately {needed:.3f} additional effective YES-side weight at extreme conviction "
                        f"is needed to cross above market."
                    ),
                    "required_effective_weight": max(0.0, needed),
                }
            )

    if cohort_summary:
        lead = cohort_summary[0]
        conditions.append(
            {
                "condition": "lead_cohort_reversal",
                "detail": (
                    f"If leading cohort '{lead['cohort']}' reverses direction or halves conviction, "
                    "the Precognition divergence would compress materially."
                ),
                "lead_cohort": lead["cohort"],
                "lead_cohort_net_contribution": lead["net_contribution"],
            }
        )
    return conditions


def _build_explanation_artifacts(
    wallet_signals: list[dict],
    wallet_profiles: dict[str, sqlite3.Row],
    market_prob: float,
    precognition_prob: float,
    divergence: float,
    denominator: float,
    confidence: float,
    disagreement: float,
    integrity_risk: float,
) -> tuple[list[dict], list[dict], dict]:
    cohort_accum: dict[str, dict] = {}
    for sig in wallet_signals:
        wallet = sig["wallet"]
        profile = wallet_profiles.get(wallet)
        cohort = _classify_cohort(profile, sig)
        entry = cohort_accum.setdefault(
            cohort,
            {
                "cohort": cohort,
                "wallets": set(),
                "effective_weight": 0.0,
                "belief_mass": 0.0,
                "confidence_mass": 0.0,
                "net_contribution": 0.0,
            },
        )
        ew = float(sig["effective_weight"])
        entry["wallets"].add(wallet)
        entry["effective_weight"] += ew
        entry["belief_mass"] += ew * float(sig["belief"])
        entry["confidence_mass"] += ew * float(sig["confidence"])
        entry["net_contribution"] += ew * (float(sig["belief"]) - market_prob)

    cohort_summary = []
    for entry in cohort_accum.values():
        ew = entry["effective_weight"]
        share = ew / max(denominator, 1e-9)
        avg_belief = entry["belief_mass"] / max(ew, 1e-9)
        avg_conf = entry["confidence_mass"] / max(ew, 1e-9)
        cohort_summary.append(
            {
                "cohort": entry["cohort"],
                "wallet_count": len(entry["wallets"]),
                "weight_share": round(share, 6),
                "avg_belief": round(avg_belief, 6),
                "avg_confidence": round(avg_conf, 6),
                "net_contribution": round(entry["net_contribution"], 6),
            }
        )
    cohort_summary.sort(key=lambda c: abs(c["net_contribution"]), reverse=True)
    cohort_summary = cohort_summary[:8]

    flip_conditions = _build_flip_conditions(
        market_prob=market_prob,
        precognition_prob=precognition_prob,
        denominator=denominator,
        divergence=divergence,
        cohort_summary=cohort_summary,
    )

    directional = "YES-leaning" if divergence > 0 else ("NO-leaning" if divergence < 0 else "neutral")
    explanation = {
        "summary": (
            f"Precognition is {precognition_prob:.3f} vs market {market_prob:.3f} ({directional}), "
            f"confidence {confidence:.2f}, disagreement {disagreement:.3f}, integrity risk {integrity_risk:.3f}."
        ),
        "diagnostics": {
            "denominator": round(denominator, 6),
            "wallet_count": len(wallet_signals),
            "confidence": round(confidence, 6),
            "disagreement": round(disagreement, 6),
            "integrity_risk": round(integrity_risk, 6),
        },
        "evidence": {
            "top_cohorts": cohort_summary,
            "flip_conditions": flip_conditions,
        },
    }
    return cohort_summary, flip_conditions, explanation


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
            "precognition_prob": market_prob,
            "divergence": 0.0,
            "confidence": 0.0,
            "disagreement": 0.0,
            "participation_quality": 0.0,
            "integrity_risk": 1.0,
            "active_wallets": 0,
            "top_drivers": [],
            "cohort_summary": [],
            "flip_conditions": [],
            "explanation_json": {
                "summary": "No qualifying trusted wallets with confidence above zero for this snapshot.",
                "diagnostics": {},
                "evidence": {},
            },
        }
        if persist:
            conn.execute(
                """
                INSERT INTO precognition_snapshots (
                  market_id, snapshot_time, market_prob, precognition_prob, divergence, confidence,
                  disagreement, participation_quality, integrity_risk, active_wallets, top_drivers,
                  cohort_summary, flip_conditions, explanation_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(market_id, snapshot_time) DO UPDATE SET
                  market_prob = excluded.market_prob,
                  precognition_prob = excluded.precognition_prob,
                  divergence = excluded.divergence,
                  confidence = excluded.confidence,
                  disagreement = excluded.disagreement,
                  participation_quality = excluded.participation_quality,
                  integrity_risk = excluded.integrity_risk,
                  active_wallets = excluded.active_wallets,
                  top_drivers = excluded.top_drivers,
                  cohort_summary = excluded.cohort_summary,
                  flip_conditions = excluded.flip_conditions,
                  explanation_json = excluded.explanation_json
                """,
                (
                    market_id,
                    snapshot_dt.isoformat(),
                    result["market_prob"],
                    result["precognition_prob"],
                    result["divergence"],
                    result["confidence"],
                    result["disagreement"],
                    result["participation_quality"],
                    result["integrity_risk"],
                    result["active_wallets"],
                    json.dumps(result["top_drivers"]),
                    json.dumps(result["cohort_summary"]),
                    json.dumps(result["flip_conditions"]),
                    json.dumps(result["explanation_json"]),
                ),
            )
        return result

    denominator = sum(sig["effective_weight"] for sig in wallet_signals)
    precognition_prob = sum(sig["effective_weight"] * sig["belief"] for sig in wallet_signals) / max(denominator, 1e-9)
    precognition_prob = clamp(precognition_prob, 0.001, 0.999)

    shares = [sig["effective_weight"] / denominator for sig in wallet_signals]
    disagreement = math.sqrt(
        sum(shares[i] * ((wallet_signals[i]["belief"] - precognition_prob) ** 2) for i in range(len(wallet_signals)))
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

    divergence = precognition_prob - market_prob
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
    wallet_profiles = _load_wallet_profiles(conn, [sig["wallet"] for sig in wallet_signals])
    cohort_summary, flip_conditions, explanation_json = _build_explanation_artifacts(
        wallet_signals=wallet_signals,
        wallet_profiles=wallet_profiles,
        market_prob=market_prob,
        precognition_prob=precognition_prob,
        divergence=divergence,
        denominator=denominator,
        confidence=confidence,
        disagreement=disagreement,
        integrity_risk=integrity_risk,
    )

    result = {
        "market_id": market_id,
        "snapshot_time": snapshot_dt.isoformat(),
        "market_prob": market_prob,
        "precognition_prob": precognition_prob,
        "divergence": divergence,
        "confidence": confidence,
        "disagreement": disagreement,
        "participation_quality": participation_quality,
        "integrity_risk": integrity_risk,
        "active_wallets": len(wallet_signals),
        "top_drivers": top,
        "cohort_summary": cohort_summary,
        "flip_conditions": flip_conditions,
        "explanation_json": explanation_json,
    }

    if persist:
        conn.execute(
            """
            INSERT INTO precognition_snapshots (
              market_id, snapshot_time, market_prob, precognition_prob, divergence, confidence,
              disagreement, participation_quality, integrity_risk, active_wallets, top_drivers,
              cohort_summary, flip_conditions, explanation_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(market_id, snapshot_time) DO UPDATE SET
              market_prob = excluded.market_prob,
              precognition_prob = excluded.precognition_prob,
              divergence = excluded.divergence,
              confidence = excluded.confidence,
              disagreement = excluded.disagreement,
              participation_quality = excluded.participation_quality,
              integrity_risk = excluded.integrity_risk,
              active_wallets = excluded.active_wallets,
              top_drivers = excluded.top_drivers,
              cohort_summary = excluded.cohort_summary,
              flip_conditions = excluded.flip_conditions,
              explanation_json = excluded.explanation_json
            """,
            (
                market_id,
                snapshot_dt.isoformat(),
                result["market_prob"],
                result["precognition_prob"],
                result["divergence"],
                result["confidence"],
                result["disagreement"],
                result["participation_quality"],
                result["integrity_risk"],
                result["active_wallets"],
                json.dumps(result["top_drivers"]),
                json.dumps(result["cohort_summary"]),
                json.dumps(result["flip_conditions"]),
                json.dumps(result["explanation_json"]),
            ),
        )

    return result


def build_snapshots_for_all_markets(
    conn: sqlite3.Connection,
    snapshot_time: datetime | None = None,
    include_resolved: bool = False,
) -> dict[str, int]:
    if include_resolved:
        rows = conn.execute(
            """
            SELECT DISTINCT m.id
            FROM markets m
            JOIN trades t ON t.market_id = m.id
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT DISTINCT m.id
            FROM markets m
            JOIN trades t ON t.market_id = m.id
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
          FROM precognition_snapshots
          GROUP BY market_id
        )
        SELECT
          s.market_id,
          s.snapshot_time,
          s.market_prob,
          s.precognition_prob,
          s.divergence,
          s.confidence,
          s.disagreement,
          s.participation_quality,
          s.integrity_risk,
          s.active_wallets,
          s.top_drivers,
          s.cohort_summary,
          s.flip_conditions,
          s.explanation_json,
          m.question,
          m.category,
          m.end_time
        FROM precognition_snapshots s
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
