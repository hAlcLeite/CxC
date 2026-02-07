from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import DATA_DIR, get_connection, init_db, now_utc_iso  # noqa: E402
from app.services.observability import (  # noqa: E402
    finish_pipeline_run,
    increment_metric,
    start_pipeline_run,
)
from app.services.sync import SyncCycleConfig, run_sync_cycle  # noqa: E402

LOGGER = logging.getLogger("smartcrowd.sync_runner")


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _acquire_lock(lock_path: Path, stale_lock_seconds: int) -> bool:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        try:
            lock_data = _load_json(lock_path)
        except Exception:
            lock_data = {}

        started_at_unix = lock_data.get("started_at_unix")
        now_unix = int(time.time())
        stale = False
        if isinstance(started_at_unix, (int, float)) and stale_lock_seconds > 0:
            stale = (now_unix - int(started_at_unix)) > stale_lock_seconds

        if stale:
            LOGGER.warning(
                "Removing stale sync lock at %s (age=%ss).",
                lock_path,
                now_unix - int(started_at_unix),
            )
            try:
                lock_path.unlink(missing_ok=True)
            except Exception:
                return False
            return _acquire_lock(lock_path, stale_lock_seconds)
        return False

    payload = {
        "pid": os.getpid(),
        "hostname": socket.gethostname(),
        "started_at": now_utc_iso(),
        "started_at_unix": int(time.time()),
    }
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), sort_keys=True)
    return True


def _release_lock(lock_path: Path) -> None:
    try:
        lock_path.unlink(missing_ok=True)
    except Exception:
        LOGGER.exception("Failed to release lock file %s", lock_path)


def _build_config(args: argparse.Namespace, reset_checkpoint: bool) -> SyncCycleConfig:
    return SyncCycleConfig(
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
        reset_checkpoint=reset_checkpoint,
        include_resolved_snapshots=not args.exclude_resolved_snapshots,
        run_recompute=not args.skip_recompute,
        run_backtest=False,
        backtest_cutoff_hours=args.backtest_cutoff_hours,
    )


def _should_run_backtest(cycle_num: int, args: argparse.Namespace) -> bool:
    if args.run_backtest_every_cycles <= 0:
        return False
    if cycle_num <= 0:
        return False
    return cycle_num % args.run_backtest_every_cycles == 0


def run() -> None:
    parser = argparse.ArgumentParser(
        description="Periodic sync runner for Polymarket ingest -> recompute -> optional backtest."
    )
    parser.add_argument("--interval-seconds", type=int, default=300, help="Sleep between sync cycles")
    parser.add_argument("--max-cycles", type=int, default=0, help="0 means run forever")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit")
    parser.add_argument("--run-backtest-every-cycles", type=int, default=0, help="0 disables periodic backtests")
    parser.add_argument("--backtest-cutoff-hours", type=float, default=12.0)
    parser.add_argument("--exclude-resolved-snapshots", action="store_true")
    parser.add_argument("--skip-recompute", action="store_true")

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

    parser.add_argument(
        "--lock-file",
        default=str(DATA_DIR / "sync_runner.lock"),
        help="Lock file path to prevent multiple writer runners.",
    )
    parser.add_argument("--stale-lock-seconds", type=int, default=7200)
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()

    _configure_logging(args.log_level)
    init_db()

    lock_path = Path(args.lock_file)
    if not _acquire_lock(lock_path, stale_lock_seconds=args.stale_lock_seconds):
        print(
            f"Another sync runner appears active (lock: {lock_path}). "
            "Stop it or pass a different --lock-file."
        )
        return

    LOGGER.info("sync_runner_started lock_file=%s", lock_path)
    cycle_num = 0
    reset_checkpoint_pending = bool(args.reset_checkpoint)

    try:
        while True:
            cycle_num += 1
            run_backtest_this_cycle = _should_run_backtest(cycle_num, args)
            cycle_config = _build_config(args, reset_checkpoint=reset_checkpoint_pending)
            cycle_config.run_backtest = run_backtest_this_cycle
            reset_checkpoint_pending = False

            with get_connection() as conn:
                with conn:
                    run_id = start_pipeline_run(
                        conn,
                        "scheduled_sync",
                        metadata={
                            "cycle_num": cycle_num,
                            "runner_config": asdict(cycle_config),
                            "once": args.once,
                            "interval_seconds": args.interval_seconds,
                        },
                    )

                cycle_started = time.perf_counter()
                try:
                    with conn:
                        cycle_result = run_sync_cycle(conn, cycle_config)
                        finish_pipeline_run(
                            conn,
                            run_id,
                            "success",
                            metrics={
                                "cycle_num": cycle_num,
                                "config": asdict(cycle_config),
                                "result": cycle_result,
                            },
                        )
                    duration_ms = (time.perf_counter() - cycle_started) * 1000.0
                    print(
                        f"[cycle {cycle_num}] ingest_inserted={cycle_result['ingest'].get('trades_inserted')} "
                        f"checkpoint_after={cycle_result['ingest'].get('checkpoint_last_timestamp_after')} "
                        f"duration_ms={duration_ms:.1f} backtest={bool(cycle_result.get('backtest'))}"
                    )
                except Exception as exc:
                    duration_ms = (time.perf_counter() - cycle_started) * 1000.0
                    with conn:
                        finish_pipeline_run(
                            conn,
                            run_id,
                            "failed",
                            metrics={
                                "cycle_num": cycle_num,
                                "config": asdict(cycle_config),
                                "duration_ms": duration_ms,
                            },
                            error_text=str(exc),
                        )
                        increment_metric(conn, "errors.scheduled_sync", 1.0)
                    LOGGER.exception("sync_cycle_failed cycle=%s duration_ms=%.2f", cycle_num, duration_ms)
                    print(f"[cycle {cycle_num}] failed: {exc}")

            if args.once:
                break
            if args.max_cycles > 0 and cycle_num >= args.max_cycles:
                break
            sleep_for = max(1, int(args.interval_seconds))
            time.sleep(sleep_for)
    except KeyboardInterrupt:
        LOGGER.info("sync_runner_interrupted")
    finally:
        _release_lock(lock_path)
        LOGGER.info("sync_runner_stopped")


if __name__ == "__main__":
    run()
