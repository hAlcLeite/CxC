# CxC 

This is the submission to the CxC hackathon.

## Frontend MVP 

Requirements: pnpm 

```Bash
cd frontend && pnpm install && pnpm dev
```

Visit `localhost:3000` to view the dashboard.

## Backend MVP

Wallet-weighted SmartCrowd backend lives in `backend/`.

Quick run:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
python scripts/seed_demo_data.py --load
uvicorn app.main:app --reload --port 8000
```

Live API ingest (no CSV):

`POST http://localhost:8000/ingest/polymarket`
