# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SmartCrowd is a wallet-weighted prediction market signal platform. It ingests market/trade data from Polymarket, profiles wallet credibility, infers wallet beliefs from trade sequences, and publishes manipulation-aware probability predictions.

## Build & Run Commands

### Backend (Python/FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\Activate.ps1 on Windows
pip install -e .

# Run with demo data
python scripts/seed_demo_data.py --load
uvicorn app.main:app --reload --port 8000

# Ingest live Polymarket data and run backtest
python scripts/load_polymarket.py --run-backtest
```

API docs: http://localhost:8000/docs
Screener UI: http://localhost:8000/screener

### Frontend (Next.js/TypeScript)

```bash
cd frontend
pnpm dev      # Development server (port 3000)
pnpm build    # Production build
pnpm lint     # ESLint check
```

## Architecture

```
Polymarket APIs / CSV
        ↓
   Ingestion Layer (app/services/ingest.py, polymarket.py)
        ↓
   SQLite (backend/data/smartcrowd.db)
        ↓
   Pipeline (recompute_pipeline)
   ├→ compute_wallet_metrics() - Brier, calibration, style metrics
   ├→ compute_wallet_weights() - Shrinkage-blended trust weights
   └→ build_snapshots_for_all_markets() - SmartCrowd probability aggregation
        ↓
   FastAPI Endpoints (app/api.py)
```

### Backend Structure (`backend/app/`)

- `main.py` - Uvicorn entrypoint
- `api.py` - FastAPI routes
- `db.py` - SQLite schema and connections
- `config.py` - Environment configuration
- `schemas.py` - Pydantic models
- `services/` - Core business logic:
  - `polymarket.py` - Live Polymarket API ingestion
  - `beliefs.py` - Wallet belief inference with recency decay
  - `features.py` - Wallet profiling (Brier score, calibration, style)
  - `weights.py` - Shrinkage trust weight computation
  - `smartcrowd.py` - SmartCrowd snapshot building
  - `backtest.py` - Evaluation pipeline

### Frontend Structure (`frontend/`)

- Uses Next.js 16 with React 19, TypeScript 5, Tailwind CSS 4
- React Compiler enabled via `next.config.ts`
- Path alias: `@/*` → `./src/*`

## Key Environment Variables

- `SMARTCROWD_DB_PATH` - SQLite path (default: `backend/data/smartcrowd.db`)
- `SMARTCROWD_HALF_LIFE_HOURS` - Belief inference decay (default: 48)
- `SMARTCROWD_BACKTEST_CUTOFF_HOURS` - Backtest horizon (default: 12)

## Important Notes

- **SQLite locking**: Only one writer process at a time. Stop server before running ingest jobs.
- **Outcome inference**: MVP infers outcomes when final price near 1.0 (threshold 0.97). Production should use explicit oracle.
- **Idempotency**: External IDs are deterministically hashed to prevent duplicate trades.

## Frontend Design System

Per `frontend/DESIGN.md`:
- NeoBrutalistic design: sharp corners, bold black/white
- Dark mode only (v1): black background (#0a0a0a), white text (#ededed)
- Hover microinteraction: bg black→white, text white→black
