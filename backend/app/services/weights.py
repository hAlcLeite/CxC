from __future__ import annotations

import math
import sqlite3

from app.db import now_utc_iso


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def compute_wallet_weights(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute(
        """
        SELECT
          wallet, category, horizon_bucket, sample_markets, brier,
          calibration_error, churn, persistence, specialization
        FROM wallet_metrics
        """
    ).fetchall()

    global_edges: dict[str, float] = {}
    for row in rows:
        if row["category"] == "ALL" and row["horizon_bucket"] == "ALL":
            global_edges[row["wallet"]] = 0.25 - float(row["brier"])

    payload: list[tuple] = []
    for row in rows:
        wallet = row["wallet"]
        category = row["category"]
        horizon = row["horizon_bucket"]
        support = int(row["sample_markets"])
        if support <= 0:
            continue

        local_edge = 0.25 - float(row["brier"])
        global_edge = global_edges.get(wallet, 0.0)

        is_global = category == "ALL" and horizon == "ALL"
        prior_strength = 22.0 if is_global else 12.0
        shrink = support / (support + prior_strength)
        blended_edge = shrink * local_edge + (1.0 - shrink) * global_edge

        base_weight = clamp(1.0 + (blended_edge / 0.25), 0.20, 3.00)
        churn = clamp(float(row["churn"]), 0.0, 1.0)
        persistence = clamp(float(row["persistence"]), 0.0, 1.0)
        calibration_error = clamp(float(row["calibration_error"]), 0.0, 1.0)
        specialization = clamp(float(row["specialization"]), 0.0, 1.0)

        style_penalty = max(0.45, 1.0 - 0.60 * churn)
        persistence_boost = 0.85 + 0.30 * persistence
        calibration_penalty = max(0.50, 1.0 - calibration_error)
        specialization_boost = 0.90 + 0.20 * specialization
        weight = clamp(
            base_weight * style_penalty * persistence_boost * calibration_penalty * specialization_boost,
            0.10,
            4.00,
        )
        uncertainty = clamp((1.0 / math.sqrt(support + 1)) * 0.9 + calibration_error * 0.4, 0.0, 1.0)

        payload.append(
            (
                wallet,
                category,
                horizon,
                weight,
                uncertainty,
                support,
                now_utc_iso(),
            )
        )

    conn.execute("DELETE FROM wallet_weights")
    conn.executemany(
        """
        INSERT INTO wallet_weights (
          wallet, category, horizon_bucket, weight, uncertainty, support, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        payload,
    )
    return {"wallet_weight_rows": len(payload)}

