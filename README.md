# Prec0gnition

Precognition is a wallet-weighted prediction market signal platform. It ingests trade-level data from Polymarket, profiles wallet behavior, infers current beliefs from trade sequences, and publishes a manipulation-aware probability that is meant to separate trusted cohort conviction from raw market price. The stack is Next.js on the frontend, FastAPI on the backend, and SQLite for lightweight local storage.

## Frontend

Requirements: `pnpm`

```bash
cd frontend && pnpm install && pnpm dev
```

Visit `http://localhost:3000`.

## Backend

The backend lives in `backend/`.

Quick run:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -e .
python scripts/seed_demo_data.py --load
uvicorn app.main:app --reload --port 8000
```

API docs are available at `http://localhost:8000/docs`.

### Data Ingestion

The backend supports both demo CSV ingestion and live Polymarket API ingestion.

#### Demo data

```bash
python scripts/seed_demo_data.py --load
curl -X POST http://localhost:8000/pipeline/recompute
```

#### Live Polymarket data

Run the live loader directly:

```bash
python scripts/load_polymarket.py
python scripts/load_polymarket.py --run-backtest
```

Or run the scheduled sync worker:

```bash
python scripts/sync_runner.py --interval-seconds 300
```

Key backend ingestion behavior on this branch:

- Only binary markets are ingested. Multi-outcome markets are skipped so YES/NO analytics are not polluted by incompatible books.
- Incremental trade checkpoints are stored in SQLite, but newly seen markets still get a full-history backfill automatically.
- Live ingest defaults to `backfill_points=0`, so historical snapshot reconstruction only runs when explicitly requested.
- Post-ingest recompute is targeted: only markets with new trades get fresh snapshots, and wallet analytics rerun only when newly inserted trades affect resolved-market evaluation.

If you are updating an older local database to this version of the pipeline, run one repair pass after pulling:

```bash
python scripts/load_polymarket.py --reset-checkpoint
```

That forces a clean checkpoint rebuild and backfills any trade history that may have been missed by the previous global checkpoint logic.

### Pipeline Stages

Each recompute can run up to four stages:

1. `compute_wallet_metrics`: scores wallets on Brier, log loss, calibration error, churn, persistence, timing edge, ROI, and specialization.
2. `compute_wallet_weights`: shrinks local category and horizon edge estimates toward each wallet's global track record.
3. `build_snapshots_for_all_markets`: aggregates wallet beliefs into Precognition probabilities, disagreement, participation quality, and integrity risk.
4. `backfill_market_snapshots`: optionally reconstructs historical snapshots for charting.

### SQLite Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PRECOGNITION_DB_PATH` | `backend/data/precognition.db` | SQLite database path |
| `PRECOGNITION_HALF_LIFE_HOURS` | `48` | Recency decay half-life for belief inference |
| `PRECOGNITION_BACKTEST_CUTOFF_HOURS` | `12` | Default backtest horizon |
