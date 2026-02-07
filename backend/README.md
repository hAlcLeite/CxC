# Precognition Backend MVP

Backend service for wallet-weighted prediction market signals:
- ingest market/trade/outcome data
- compute wallet profiles and shrinkage trust weights
- infer per-wallet latent beliefs from trade sequences
- publish manipulation-aware Precognition probabilities
- evaluate Precognition vs market-implied probabilities

## Quickstart

From repo root:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
python scripts/seed_demo_data.py --load
uvicorn app.main:app --reload --port 8000
```

Then open:
- `http://localhost:8000/docs`
- `http://localhost:8000/screener`

To pull real Polymarket data directly:

```powershell
python scripts/load_polymarket.py --run-backtest
```

To run periodic sync worker (ingest + recompute every 5 min):

```powershell
python scripts/sync_runner.py --interval-seconds 300
```

## CSV Ingestion Format

### `markets.csv`
- `id` (required)
- `question`
- `end_time` (ISO timestamp)
- `category`
- `liquidity`
- `resolution_source`

### `trades.csv`
- `market_id` (required)
- `wallet` (required)
- `timestamp` or `ts` (required)
- `side` (`YES` or `NO`) (required)
- `price` (required)
- `size` (required)
- `action` (`BUY` or `SELL`) optional, default `BUY`
- `aggressiveness` optional
- `maker_taker` optional
- `external_id` optional (if omitted, deterministic hash is used)

### `outcomes.csv`
- `market_id` (required)
- `resolved_outcome` (`1/0`, `YES/NO`)
- `resolution_time` (ISO timestamp)

## Core Endpoints

- `POST /ingest/csv`
- `POST /ingest/polymarket`
- `POST /pipeline/recompute`
- `GET /screener`
- `GET /markets/{market_id}`
- `GET /wallets/{wallet}`
- `POST /backtest`
- `GET /backtest/{run_id}`
- `GET /alerts`
- `GET /ops/runs`
- `GET /ops/metrics`

## Live Polymarket Ingestion

Example request:

```bash
curl -X POST "http://localhost:8000/ingest/polymarket?run_recompute=true" \
  -H "Content-Type: application/json" \
  -d '{
    "include_active_markets": true,
    "include_closed_markets": true,
    "active_markets_limit": 120,
    "closed_markets_limit": 250,
    "trades_per_market": 300,
    "trade_page_size": 200,
    "market_chunk_size": 10,
    "taker_only": false,
    "use_incremental_checkpoint": true,
    "checkpoint_lookback_seconds": 300,
    "prefer_recent_closed_markets": true,
    "reset_checkpoint": false
  }'
```

Notes:
- Markets come from `https://gamma-api.polymarket.com/markets`.
- Trades come from `https://data-api.polymarket.com/trades`.
- Outcomes are inferred for closed binary markets when one final outcome price is near 1.0.
- Closed markets are fetched from the recent tail by default (`prefer_recent_closed_markets=true`) to avoid stale 2020/2021-only ingestion.
- Incremental mode stores the latest trade timestamp checkpoint in SQLite (`ingestion_checkpoints`).

## Incremental Sync Tips

- First run:
  - `python scripts/load_polymarket.py --run-backtest`
- Next runs (faster incremental):
  - same command, checkpoint is used automatically
- Force full trade backfill:
  - `python scripts/load_polymarket.py --no-incremental-checkpoint`
- Build snapshots for resolved markets too (off by default for fresher live views):
  - `python scripts/load_polymarket.py --include-resolved-snapshots`
- Reset checkpoint:
  - `python scripts/load_polymarket.py --reset-checkpoint`

## Scheduled Sync Runner

Run a single cycle (good for smoke test):

```powershell
python scripts/sync_runner.py --once --active-markets-limit 10 --closed-markets-limit 10 --trades-per-market 40
```

Run continuously with backtest every 12 cycles:

```powershell
python scripts/sync_runner.py --interval-seconds 300 --run-backtest-every-cycles 12
```

Include resolved market snapshots in scheduled cycles (off by default):

```powershell
python scripts/sync_runner.py --interval-seconds 300 --include-resolved-snapshots
```

Notes:
- Uses lock file `backend/data/sync_runner.lock` to avoid concurrent writer runners.
- You can override lock path with `--lock-file`.
- `pipeline_runs` captures each cycle as `run_type=scheduled_sync`.
