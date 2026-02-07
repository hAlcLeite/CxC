from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import get_connection, init_db  # noqa: E402
from app.services.backtest import run_backtest  # noqa: E402
from app.services.pipeline import recompute_pipeline  # noqa: E402
from app.services.polymarket import ingest_polymarket  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest live data from Polymarket APIs.")
    parser.add_argument("--active-markets-limit", type=int, default=120)
    parser.add_argument("--closed-markets-limit", type=int, default=250)
    parser.add_argument("--trades-per-market", type=int, default=300)
    parser.add_argument("--trade-page-size", type=int, default=200)
    parser.add_argument("--market-chunk-size", type=int, default=10)
    parser.add_argument("--taker-only", action="store_true")
    parser.add_argument("--min-trade-timestamp", type=int, default=None)
    parser.add_argument("--max-trade-timestamp", type=int, default=None)
    parser.add_argument("--no-incremental-checkpoint", action="store_true")
    parser.add_argument("--checkpoint-lookback-seconds", type=int, default=300)
    parser.add_argument("--reset-checkpoint", action="store_true")
    parser.add_argument("--skip-recompute", action="store_true")
    parser.add_argument("--run-backtest", action="store_true")
    args = parser.parse_args()

    init_db()
    with get_connection() as conn:
        with conn:
            ingest_result = ingest_polymarket(
                conn,
                include_active_markets=args.active_markets_limit > 0,
                include_closed_markets=args.closed_markets_limit > 0,
                active_markets_limit=args.active_markets_limit,
                closed_markets_limit=args.closed_markets_limit,
                trades_per_market=args.trades_per_market,
                trade_page_size=args.trade_page_size,
                market_chunk_size=args.market_chunk_size,
                taker_only=args.taker_only,
                min_trade_timestamp=args.min_trade_timestamp,
                max_trade_timestamp=args.max_trade_timestamp,
                use_incremental_checkpoint=not args.no_incremental_checkpoint,
                checkpoint_lookback_seconds=args.checkpoint_lookback_seconds,
                reset_checkpoint=args.reset_checkpoint,
            )
            print("Ingest:", ingest_result)

            if not args.skip_recompute:
                pipeline_result = recompute_pipeline(conn, include_resolved_snapshots=True)
                print("Pipeline:", pipeline_result)

            if args.run_backtest:
                backtest = run_backtest(conn, cutoff_hours=12.0)
                print(
                    "Backtest:",
                    {
                        "run_id": backtest.get("run_id"),
                        "markets_evaluated": backtest.get("markets_evaluated"),
                        "brier": backtest.get("brier"),
                        "log_loss": backtest.get("log_loss"),
                    },
                )


if __name__ == "__main__":
    main()
