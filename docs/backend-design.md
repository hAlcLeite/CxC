# SmartCrowd Backend MVP Design

## 1) Purpose

Build a backend system that computes a second forecast signal for prediction markets:

- `Market Prob`: implied by market price
- `SmartCrowd Prob`: implied by wallet-level trade flow weighted by historical reliability

The system ingests market/trade/outcome data, profiles wallets, computes trust weights with shrinkage, infers wallet beliefs from trade sequences, produces manipulation-aware SmartCrowd snapshots, and evaluates predictive quality with backtests.

## 2) Scope

### In scope (MVP)

- Data ingestion from:
  - CSV files (`/ingest/csv`)
  - Live Polymarket APIs (`/ingest/polymarket`)
- SQLite storage for markets, trades, outcomes, wallet metrics, weights, snapshots, backtests
- Incremental ingestion checkpoints for resumable live sync
- Observability primitives (run history + metrics counters)
- Wallet feature computation:
  - Brier/log-loss calibration and quality metrics
  - style/behavior signals (churn, persistence, trade size, timing)
  - specialization score
- Trust-weight model with shrinkage by support
- SmartCrowd probability aggregation with confidence and integrity controls
- Backtesting and evaluation summary
- API endpoints for screener, market detail, wallet explorer, alerts

### Out of scope (current MVP)

- Live websocket streaming ingestion
- Full order-book/cancel microstructure modeling
- True on-chain position reconciliation
- Production auth/tenanting
- Distributed task orchestration

## 3) High-Level Architecture

```text
Polymarket APIs / CSV
        |
        v
Ingestion Services
        |
        v
SQLite Core Tables (markets, trades, outcomes)
        |
        +--> Wallet Features  --> wallet_metrics
        |
        +--> Wallet Weights   --> wallet_weights
        |
        +--> SmartCrowd Build --> smartcrowd_snapshots
        |
        +--> Backtest         --> market_backtests + backtest_reports
        |
        v
FastAPI endpoints (screener, market, wallet, alerts, backtest)
```

## 4) Code Layout

- `backend/app/main.py`: app entrypoint
- `backend/app/api.py`: REST endpoints and orchestration
- `backend/app/db.py`: SQLite schema + connection
- `backend/app/config.py`: config/env defaults
- `backend/app/services/ingest.py`: CSV ingestion
- `backend/app/services/polymarket.py`: live Polymarket ingestion
- `backend/app/services/beliefs.py`: wallet belief inference from trade sequences
- `backend/app/services/features.py`: wallet profiling
- `backend/app/services/weights.py`: shrinkage trust weights
- `backend/app/services/smartcrowd.py`: SmartCrowd snapshot construction
- `backend/app/services/backtest.py`: evaluation pipeline
- `backend/app/services/pipeline.py`: recompute orchestration
- `backend/scripts/load_polymarket.py`: CLI for live ingest
- `backend/scripts/sync_runner.py`: periodic sync worker with lock + cycle scheduling
- `backend/scripts/seed_demo_data.py`: demo data generator/loader

## 5) Data Model

### `markets`

- `id` (PK)
- `question`
- `end_time`
- `category`
- `liquidity`
- `resolution_source`

### `trades`

- `external_id` (unique)
- `market_id` (FK)
- `wallet`
- `ts`
- `side` (`YES` / `NO`)
- `action` (`BUY` / `SELL`)
- `price` (`0..1`)
- `size` (`>0`)
- `aggressiveness` (optional)
- `maker_taker` (optional)
- `raw_payload` (JSON string)

### `outcomes`

- `market_id` (PK/FK)
- `resolved_outcome` (`0` or `1` for NO/YES)
- `resolution_time`

### Derived/materialized tables

- `wallet_metrics`: per-wallet quality/style features by category/horizon
- `wallet_weights`: trust weight and uncertainty by category/horizon
- `smartcrowd_snapshots`: per-market signal state at snapshot time
- `market_backtests`: per-market backtest rows
- `backtest_reports`: aggregate backtest summary JSON
- `ingestion_checkpoints`: incremental sync state (`last_timestamp` + metadata)
- `pipeline_runs`: run history table (status, duration, metrics, errors)
- `system_metrics`: counters/latency aggregates

## 6) Ingestion Design

## 6.1 CSV ingestion

`POST /ingest/csv` accepts optional paths for markets/trades/outcomes and upserts rows with normalization:

- canonical side/action parsing
- ISO UTC timestamp parsing
- deterministic `external_id` hashing when missing
- strict price/size validation
- auto-create placeholder markets when needed

## 6.2 Live Polymarket ingestion

`POST /ingest/polymarket` and `scripts/load_polymarket.py`:

1. Pull markets from Gamma API:
   - active and/or closed windows
2. Upsert market metadata into `markets`
3. Infer outcomes for closed binary markets:
   - if one outcome price is near `1.0` (threshold default `0.97`)
4. Pull trades from Data API `/trades` in market chunks with paging
5. Map Polymarket payload to internal trade format:
   - `outcomeIndex 0 -> YES`, `1 -> NO`
   - robust normalize wallet, timestamp, side/action, price/size
   - fallback outcome resolution via outcome labels when `outcomeIndex` is missing
   - generate idempotent `external_id` hash

6. Incremental checkpoint behavior:
   - store latest ingested trade timestamp in `ingestion_checkpoints`
   - next run sets `timestamp_start` using checkpoint minus lookback window

### Idempotency

- `ON CONFLICT(external_id) DO NOTHING` prevents duplicate trade insertions across repeated pulls.

### Current ingestion limitations

- API trade side/maker-taker semantics are approximated from available fields.
- Outcome inference for closed markets is probabilistic (price-based), not direct oracle status.

## 7) Wallet Profiling

Wallet features are computed from resolved markets and grouped by:

- `(wallet, ALL, ALL)` global
- `(wallet, category, ALL)`
- `(wallet, ALL, horizon_bucket)`
- `(wallet, category, horizon_bucket)`

Feature outputs:

- Predictive quality:
  - average Brier score
  - average log loss
  - calibration error
  - optional ROI proxy
- Style:
  - average trade size
  - churn (direction flip rate)
  - persistence (`1 - churn`)
- Specialization:
  - category entropy transformed to specialization score
- Timing edge:
  - directional alignment to final pre-resolution movement proxy

## 8) Belief Inference from Trade Sequences

Per wallet and market, infer latent belief and confidence from trade history:

1. Convert each fill into a YES-implied vote
2. Weight votes by:
   - size (`sqrt(size)`)
   - recency (exponential half-life decay)
   - persistence boost (streak-aware)
3. Compute weighted belief and directionality
4. Derive conviction confidence from:
   - signal mass
   - sample support
   - persistence/churn

Output:

- `belief` in `[0,1]`
- `confidence` in `[0,1]`
- behavioral stats (`churn`, `persistence`, `avg_size`, `net_direction`)

## 9) Trust Weight Model (Shrinkage Core)

For each wallet/category/horizon tuple:

1. Compute local predictive edge proxy: `edge = 0.25 - brier`
2. Blend local edge with wallet global edge using support-based shrinkage:
   - `shrink = n / (n + prior_strength)`
3. Convert blended edge to base trust weight
4. Adjust weight via style + calibration penalties:
   - churn penalty
   - persistence boost
   - calibration penalty
   - specialization boost
5. Compute uncertainty from support and calibration error

Result:

- `weight` (bounded positive trust)
- `uncertainty` (0..1)

## 10) SmartCrowd Signal Construction

At market time `t`:

1. For each active wallet:
   - infer `belief_i(t)` and `confidence_i(t)`
   - lookup conditional trust weight `w_i` with fallback chain
2. Effective weight:
   - `ew_i = w_i * confidence_i * anti_noise_i`
3. Aggregate:
   - `SmartCrowd = sum(ew_i * belief_i) / sum(ew_i)`

Additional outputs:

- `divergence = SmartCrowd - MarketProb`
- `disagreement` (weighted belief dispersion)
- `participation_quality` (effective N via Herfindahl)
- `integrity_risk` (concentration + churn proxy)
- `confidence` (support x agreement x participation x integrity adjustment)
- `top_drivers` wallets by absolute contribution
- `cohort_summary` (cohort-level contribution and participation)
- `flip_conditions` (what evidence/flow would likely flip signal)
- `explanation_json` (structured explanation artifacts)

## 11) Manipulation and Noise Controls

Integrated controls in weighting/confidence:

- downweight high churn / low persistence wallets
- concentration penalty through Herfindahl concentration
- confidence suppression under high integrity risk
- low-wallet-count confidence haircut

These are safeguards against pumpy or concentrated activity.

## 12) Backtesting and Evaluation

Backtest method:

1. For resolved markets, evaluate at a historical cutoff (e.g. 12h before end/resolution)
2. Compute market and SmartCrowd probabilities at cutoff
3. Compare against realized outcome

Metrics:

- Brier score (market vs SmartCrowd)
- Log loss (market vs SmartCrowd)
- Calibration bins
- Divergence edge buckets (`|SmartCrowd - Market|`) with win-rate comparisons
- Top divergence case studies with winner labels

Persistence:

- per-run rows: `market_backtests`
- summary: `backtest_reports.summary_json`

## 13) API Surface

- `GET /health`
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

## 14) Operational Runbook

### Bootstrap

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
```

### Live ingest + recompute + backtest

```powershell
.\.venv\Scripts\python.exe .\scripts\load_polymarket.py --run-backtest
```

### Periodic sync worker

```powershell
.\.venv\Scripts\python.exe .\scripts\sync_runner.py --interval-seconds 300 --run-backtest-every-cycles 12
```

### Serve API

```powershell
uvicorn app.main:app --reload --port 8000
```

### Common issue: `database is locked`

- Ensure only one writer process is active.
- Stop any running server/job using `backend/data/smartcrowd.db`.
- Re-run ingest command.

## 15) Design Tradeoffs

- SQLite chosen for speed of implementation and portability.
- Rule-based belief inference and shrinkage weighting chosen for MVP interpretability and robustness under sparse data.
- Outcome inference for closed markets is practical but imperfect; production-grade resolution should use explicit oracle outcomes.

## 16) Security and Data Integrity Notes

- No API secrets currently required for public endpoints used.
- Input validation is strict for type/price/size bounds.
- Idempotent external IDs reduce duplicate ingestion artifacts.
- Raw payload persisted for audit/debug traceability.

## 17) Next Phase Recommendations

1. Replace inferred outcomes with authoritative resolved outcomes feed.
2. Expand incremental checkpoints from global timestamp to per-market/per-condition cursors.
3. Add job scheduler/queue for periodic recompute and backtest.
4. Add richer microstructure/anomaly features (cancel/fill, impact without volume).
5. Add cohort clustering and lead-lag graph for explanation quality.
