from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    markets_path: str | None = None
    trades_path: str | None = None
    outcomes_path: str | None = None


class PolymarketIngestRequest(BaseModel):
    include_active_markets: bool = True
    include_closed_markets: bool = True
    active_markets_limit: int = Field(default=200, ge=0, le=5000)
    closed_markets_limit: int = Field(default=400, ge=0, le=10000)
    trades_per_market: int = Field(default=400, ge=1, le=10000)
    trade_page_size: int = Field(default=200, ge=1, le=10000)
    market_chunk_size: int = Field(default=10, ge=1, le=200)
    taker_only: bool = False
    min_trade_timestamp: int | None = Field(default=None, ge=0)
    max_trade_timestamp: int | None = Field(default=None, ge=0)
    use_incremental_checkpoint: bool = True
    checkpoint_lookback_seconds: int = Field(default=300, ge=0, le=86400)
    prefer_recent_closed_markets: bool = True
    reset_checkpoint: bool = False
    request_delay_ms: int = Field(default=250, ge=0, le=5000)


class RecomputeRequest(BaseModel):
    snapshot_time: datetime | None = None
    include_resolved_snapshots: bool = False


class BacktestRequest(BaseModel):
    cutoff_hours: float = Field(default=1.0, gt=0.0, le=168.0)
    run_id: str | None = None


class IngestResponse(BaseModel):
    ingested: dict[str, int]
    db_path: str


class HealthResponse(BaseModel):
    status: str


class GenericResponse(BaseModel):
    result: dict[str, Any]
