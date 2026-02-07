from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("SMARTCROWD_DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.getenv("SMARTCROWD_DB_PATH", DATA_DIR / "smartcrowd.db"))

RECENCY_HALF_LIFE_HOURS = float(os.getenv("SMARTCROWD_HALF_LIFE_HOURS", "48"))
DEFAULT_BACKTEST_CUTOFF_HOURS = float(os.getenv("SMARTCROWD_BACKTEST_CUTOFF_HOURS", "12"))

# Backboard.io API Key for AI explanations
BACKBOARD_API_KEY = os.getenv("BACKBOARD_API_KEY", "")

