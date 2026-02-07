from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from app.config import DATA_DIR, DB_PATH

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'unknown',
  liquidity REAL NOT NULL DEFAULT 0,
  resolution_source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  market_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  ts TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('YES', 'NO')),
  action TEXT NOT NULL DEFAULT 'BUY' CHECK (action IN ('BUY', 'SELL')),
  price REAL NOT NULL CHECK (price >= 0 AND price <= 1),
  size REAL NOT NULL CHECK (size > 0),
  aggressiveness REAL,
  maker_taker TEXT,
  raw_payload TEXT,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outcomes (
  market_id TEXT PRIMARY KEY,
  resolved_outcome INTEGER NOT NULL CHECK (resolved_outcome IN (0, 1)),
  resolution_time TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_metrics (
  wallet TEXT NOT NULL,
  category TEXT NOT NULL,
  horizon_bucket TEXT NOT NULL,
  sample_markets INTEGER NOT NULL,
  sample_trades INTEGER NOT NULL,
  brier REAL NOT NULL,
  log_loss REAL NOT NULL,
  roi REAL NOT NULL,
  calibration_error REAL NOT NULL,
  avg_trade_size REAL NOT NULL,
  churn REAL NOT NULL,
  persistence REAL NOT NULL,
  specialization REAL NOT NULL,
  timing_edge REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wallet, category, horizon_bucket)
);

CREATE TABLE IF NOT EXISTS wallet_weights (
  wallet TEXT NOT NULL,
  category TEXT NOT NULL,
  horizon_bucket TEXT NOT NULL,
  weight REAL NOT NULL,
  uncertainty REAL NOT NULL,
  support INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wallet, category, horizon_bucket)
);

CREATE TABLE IF NOT EXISTS smartcrowd_snapshots (
  market_id TEXT NOT NULL,
  snapshot_time TEXT NOT NULL,
  market_prob REAL NOT NULL,
  smartcrowd_prob REAL NOT NULL,
  divergence REAL NOT NULL,
  confidence REAL NOT NULL,
  disagreement REAL NOT NULL,
  participation_quality REAL NOT NULL,
  integrity_risk REAL NOT NULL,
  active_wallets INTEGER NOT NULL,
  top_drivers TEXT NOT NULL,
  PRIMARY KEY (market_id, snapshot_time),
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS market_backtests (
  run_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  cutoff_time TEXT NOT NULL,
  market_prob REAL NOT NULL,
  smartcrowd_prob REAL NOT NULL,
  outcome INTEGER NOT NULL,
  confidence REAL NOT NULL,
  divergence REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS backtest_reports (
  run_id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  summary_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_market_ts ON trades(market_id, ts);
CREATE INDEX IF NOT EXISTS idx_trades_wallet_ts ON trades(wallet, ts);
CREATE INDEX IF NOT EXISTS idx_snapshots_market_time ON smartcrowd_snapshots(market_id, snapshot_time);
CREATE INDEX IF NOT EXISTS idx_wallet_metrics_lookup ON wallet_metrics(wallet, category, horizon_bucket);
CREATE INDEX IF NOT EXISTS idx_wallet_weights_lookup ON wallet_weights(wallet, category, horizon_bucket);
CREATE INDEX IF NOT EXISTS idx_market_backtests_run ON market_backtests(run_id);
"""


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(SCHEMA_SQL)

