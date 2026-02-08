from __future__ import annotations

import sqlite3
from datetime import datetime

from app.services.features import compute_wallet_metrics
from app.services.precognition import backfill_market_snapshots, build_snapshots_for_all_markets
from app.services.weights import compute_wallet_weights


def recompute_pipeline(
    conn: sqlite3.Connection,
    snapshot_time: datetime | None = None,
    include_resolved_snapshots: bool = False,
    backfill_points: int = 0,
) -> dict[str, int]:
    metrics = compute_wallet_metrics(conn)
    weights = compute_wallet_weights(conn)
    snapshots = build_snapshots_for_all_markets(
        conn,
        snapshot_time=snapshot_time,
        include_resolved=include_resolved_snapshots,
    )
    backfill: dict[str, int] = {}
    if backfill_points > 0:
        backfill = backfill_market_snapshots(
            conn, n_points=backfill_points,
            include_resolved=include_resolved_snapshots,
        )
    return {**metrics, **weights, **snapshots, **backfill}

