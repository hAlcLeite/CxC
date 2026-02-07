from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.services.backtest import run_backtest
from app.services.pipeline import recompute_pipeline
from app.services.polymarket import ingest_polymarket


@dataclass
class SyncCycleConfig:
    include_active_markets: bool = True
    include_closed_markets: bool = True
    active_markets_limit: int = 120
    closed_markets_limit: int = 250
    trades_per_market: int = 300
    trade_page_size: int = 200
    market_chunk_size: int = 10
    taker_only: bool = False
    min_trade_timestamp: int | None = None
    max_trade_timestamp: int | None = None
    use_incremental_checkpoint: bool = True
    checkpoint_lookback_seconds: int = 300
    prefer_recent_closed_markets: bool = True
    reset_checkpoint: bool = False
    include_resolved_snapshots: bool = False
    run_recompute: bool = True
    run_backtest: bool = False
    backtest_cutoff_hours: float = 1.0


def run_sync_cycle(conn, config: SyncCycleConfig) -> dict[str, Any]:
    cycle_started = time.perf_counter()
    ingest_result = ingest_polymarket(
        conn,
        include_active_markets=config.include_active_markets,
        include_closed_markets=config.include_closed_markets,
        active_markets_limit=config.active_markets_limit,
        closed_markets_limit=config.closed_markets_limit,
        trades_per_market=config.trades_per_market,
        trade_page_size=config.trade_page_size,
        market_chunk_size=config.market_chunk_size,
        taker_only=config.taker_only,
        min_trade_timestamp=config.min_trade_timestamp,
        max_trade_timestamp=config.max_trade_timestamp,
        use_incremental_checkpoint=config.use_incremental_checkpoint,
        checkpoint_lookback_seconds=config.checkpoint_lookback_seconds,
        prefer_recent_closed_markets=config.prefer_recent_closed_markets,
        reset_checkpoint=config.reset_checkpoint,
    )

    pipeline_result: dict[str, int] | None = None
    if config.run_recompute:
        pipeline_result = recompute_pipeline(
            conn,
            snapshot_time=None,
            include_resolved_snapshots=config.include_resolved_snapshots,
        )

    backtest_result: dict[str, Any] | None = None
    if config.run_backtest:
        backtest_result = run_backtest(conn, cutoff_hours=config.backtest_cutoff_hours)

    cycle_duration_ms = (time.perf_counter() - cycle_started) * 1000.0
    return {
        "ingest": ingest_result,
        "pipeline": pipeline_result,
        "backtest": (
            {
                "run_id": backtest_result.get("run_id"),
                "markets_evaluated": backtest_result.get("markets_evaluated"),
                "brier": backtest_result.get("brier"),
                "log_loss": backtest_result.get("log_loss"),
            }
            if backtest_result
            else None
        ),
        "cycle_duration_ms": cycle_duration_ms,
    }

