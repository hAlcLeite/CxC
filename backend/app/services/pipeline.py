from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any, Mapping

from app.services.features import compute_wallet_metrics
from app.services.precognition import backfill_market_snapshots, build_snapshots_for_all_markets
from app.services.weights import compute_wallet_weights


def build_incremental_recompute_plan(
    ingest_result: Mapping[str, Any],
    *,
    backfill_points: int = 0,
) -> dict[str, Any]:
    snapshot_market_ids = {
        str(market_id)
        for market_id in (ingest_result.get("snapshot_market_ids") or [])
        if market_id
    }
    analytics_market_ids = {
        str(market_id)
        for market_id in (ingest_result.get("analytics_market_ids") or [])
        if market_id
    }
    return {
        "market_ids": sorted(snapshot_market_ids | analytics_market_ids),
        "recompute_wallet_analytics": bool(analytics_market_ids),
        "backfill_points": backfill_points,
    }


def recompute_pipeline(
    conn: sqlite3.Connection,
    snapshot_time: datetime | None = None,
    include_resolved_snapshots: bool = False,
    backfill_points: int = 0,
    market_ids: list[str] | None = None,
    recompute_wallet_analytics: bool = True,
) -> dict[str, int]:
    result: dict[str, int] = {
        "wallet_analytics_recomputed": 1 if recompute_wallet_analytics else 0,
    }
    if recompute_wallet_analytics:
        result.update(compute_wallet_metrics(conn))
        result.update(compute_wallet_weights(conn))
    else:
        result.update({"wallet_metric_rows": 0, "wallet_weight_rows": 0})

    snapshots = build_snapshots_for_all_markets(
        conn,
        snapshot_time=snapshot_time,
        include_resolved=include_resolved_snapshots,
        market_ids=market_ids,
    )
    result.update(snapshots)

    if backfill_points > 0:
        result.update(
            backfill_market_snapshots(
                conn,
                n_points=backfill_points,
                market_ids=market_ids,
                include_resolved=include_resolved_snapshots,
            )
        )
    else:
        result["backfill_snapshots_written"] = 0

    return result

