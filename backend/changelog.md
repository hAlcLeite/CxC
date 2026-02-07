# Backend Changelog for MVP 1.O

## 2026-02-07 11:09

### Fixed: SQLite threading error under concurrent requests

`sqlite3.connect()` in `db.py` used the default `check_same_thread=True`. FastAPI runs sync generator dependencies (`get_conn`) in a threadpool where setup and teardown can land on different workers. This caused `sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that same thread` on concurrent requests (e.g. screener + alerts firing together after an ingest).

**Fix:** Added `check_same_thread=False` to `sqlite3.connect()` in `get_connection()`. Safe because each request gets its own connection instance — no two threads share a connection simultaneously.

### Fixed: Wallet detail endpoint 404 for wallets without resolved markets

The `/wallets/{wallet}` endpoint only queried `wallet_metrics` and `wallet_weights`, which are populated by `compute_wallet_metrics()`. That function joins on the `outcomes` table, so wallets that only traded on unresolved markets had no rows and returned 404 — even though they had hundreds of trades and appeared as top drivers in the screener.

**Fix:** Added a trades table fallback. When `wallet_metrics` and `wallet_weights` are empty, the endpoint now queries the `trades` table directly and returns:
- `trade_summary`: aggregate stats (trade count, market count, total volume, avg price/size, first/last trade timestamps)
- `trade_summary.recent_trades`: the 20 most recent trades with market question joined

The endpoint only returns 404 if the wallet has zero trades in the database.

### Added: CORS middleware for localhost:3000

Added `CORSMiddleware` in `create_app()` allowing requests from `http://localhost:3000` with all methods, headers, and credentials.
