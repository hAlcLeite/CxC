# SmartCrowd Backend MVP

Backend service for wallet-weighted prediction market signals:
- ingest market/trade/outcome data
- compute wallet profiles and shrinkage trust weights
- infer per-wallet latent beliefs from trade sequences
- publish manipulation-aware SmartCrowd probabilities
- evaluate SmartCrowd vs market-implied probabilities

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
    "taker_only": false
  }'
```

Notes:
- Markets come from `https://gamma-api.polymarket.com/markets`.
- Trades come from `https://data-api.polymarket.com/trades`.
- Outcomes are inferred for closed binary markets when one final outcome price is near 1.0.
