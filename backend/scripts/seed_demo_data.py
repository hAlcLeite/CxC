from __future__ import annotations

import argparse
import csv
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import get_connection, init_db  # noqa: E402
from app.services.backtest import run_backtest  # noqa: E402
from app.services.ingest import ingest_markets, ingest_outcomes, ingest_trades  # noqa: E402
from app.services.pipeline import recompute_pipeline  # noqa: E402


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _random_time(rng: random.Random, start: datetime, end: datetime) -> datetime:
    delta = (end - start).total_seconds()
    return start + timedelta(seconds=rng.random() * max(delta, 1.0))


def generate_dataset(
    out_dir: Path,
    markets_count: int,
    wallets_count: int,
    resolved_ratio: float,
    seed: int,
) -> dict[str, Path]:
    rng = random.Random(seed)
    out_dir.mkdir(parents=True, exist_ok=True)

    categories = ["sports", "politics", "crypto", "macro", "tech"]
    wallets = [f"0xw{i:04x}" for i in range(wallets_count)]
    wallet_activity = {w: rng.uniform(0.5, 2.0) for w in wallets}
    wallet_skill = {
        w: {cat: rng.gauss(0.0, 1.0) for cat in categories}
        for w in wallets
    }

    now = datetime.now(timezone.utc)
    markets_rows: list[dict] = []
    trades_rows: list[dict] = []
    outcomes_rows: list[dict] = []

    for i in range(markets_count):
        market_id = f"MKT-{i+1:04d}"
        category = rng.choice(categories)
        true_prob = clamp(rng.betavariate(2.2, 2.2), 0.03, 0.97)
        resolved = rng.random() < resolved_ratio
        end_time = now - timedelta(days=rng.randint(2, 90)) if resolved else now + timedelta(days=rng.randint(1, 30))
        resolution_time = end_time + timedelta(hours=rng.randint(1, 24)) if resolved else None

        markets_rows.append(
            {
                "id": market_id,
                "question": f"Will event {i+1} in {category} resolve YES?",
                "end_time": end_time.isoformat(),
                "category": category,
                "liquidity": round(rng.uniform(25_000, 900_000), 2),
                "resolution_source": "demo_generator",
            }
        )

        start_time = end_time - timedelta(days=rng.randint(2, 25))
        max_trade_time = min(now, resolution_time or now)
        trade_count = rng.randint(80, 180)
        market_yes_price = clamp(true_prob + rng.gauss(0.0, 0.08), 0.05, 0.95)

        for j in range(trade_count):
            wallet = rng.choices(wallets, weights=[wallet_activity[w] for w in wallets], k=1)[0]
            skill = wallet_skill[wallet][category]
            inferred_belief = clamp(true_prob + skill * 0.12 + rng.gauss(0.0, 0.08), 0.01, 0.99)
            desired_yes = 1 if inferred_belief > market_yes_price else -1
            ts = _random_time(rng, start_time, max_trade_time)

            if desired_yes > 0:
                if rng.random() < 0.82:
                    side, action = "YES", "BUY"
                else:
                    side, action = "NO", "SELL"
            else:
                if rng.random() < 0.82:
                    side, action = "NO", "BUY"
                else:
                    side, action = "YES", "SELL"

            trade_price = market_yes_price if side == "YES" else (1.0 - market_yes_price)
            trade_price = clamp(trade_price + rng.gauss(0.0, 0.01), 0.01, 0.99)
            size = max(2.0, rng.lognormvariate(2.0, 0.85) * 10.0)
            aggressiveness = round(rng.uniform(0.0, 1.0), 3)
            maker_taker = "taker" if rng.random() < 0.58 else "maker"

            trades_rows.append(
                {
                    "external_id": f"{market_id}-{j:04d}",
                    "market_id": market_id,
                    "wallet": wallet,
                    "timestamp": ts.isoformat(),
                    "side": side,
                    "action": action,
                    "price": round(trade_price, 4),
                    "size": round(size, 4),
                    "aggressiveness": aggressiveness,
                    "maker_taker": maker_taker,
                }
            )

            impact = (size / 4000.0) * desired_yes + rng.gauss(0.0, 0.006)
            market_yes_price = clamp(market_yes_price + impact, 0.02, 0.98)

        if resolved:
            outcome = 1 if rng.random() < true_prob else 0
            outcomes_rows.append(
                {
                    "market_id": market_id,
                    "resolved_outcome": outcome,
                    "resolution_time": resolution_time.isoformat(),
                }
            )

    trades_rows.sort(key=lambda r: (r["market_id"], r["timestamp"]))

    markets_path = out_dir / "markets.csv"
    trades_path = out_dir / "trades.csv"
    outcomes_path = out_dir / "outcomes.csv"

    with markets_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["id", "question", "end_time", "category", "liquidity", "resolution_source"],
        )
        writer.writeheader()
        writer.writerows(markets_rows)

    with trades_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "external_id",
                "market_id",
                "wallet",
                "timestamp",
                "side",
                "action",
                "price",
                "size",
                "aggressiveness",
                "maker_taker",
            ],
        )
        writer.writeheader()
        writer.writerows(trades_rows)

    with outcomes_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["market_id", "resolved_outcome", "resolution_time"])
        writer.writeheader()
        writer.writerows(outcomes_rows)

    return {
        "markets": markets_path,
        "trades": trades_path,
        "outcomes": outcomes_path,
        "markets_count": len(markets_rows),
        "trades_count": len(trades_rows),
        "outcomes_count": len(outcomes_rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate demo Precognition dataset.")
    parser.add_argument("--out-dir", default=str(BACKEND_DIR / "data" / "demo"), help="Output directory")
    parser.add_argument("--markets", type=int, default=80)
    parser.add_argument("--wallets", type=int, default=45)
    parser.add_argument("--resolved-ratio", type=float, default=0.75)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument(
        "--load",
        action="store_true",
        help="Load generated CSV files into SQLite and run recompute + backtest",
    )
    args = parser.parse_args()

    paths = generate_dataset(
        Path(args.out_dir),
        markets_count=args.markets,
        wallets_count=args.wallets,
        resolved_ratio=args.resolved_ratio,
        seed=args.seed,
    )
    print(f"Generated markets={paths['markets_count']} trades={paths['trades_count']} outcomes={paths['outcomes_count']}")
    print(f"markets.csv: {paths['markets']}")
    print(f"trades.csv: {paths['trades']}")
    print(f"outcomes.csv: {paths['outcomes']}")

    if not args.load:
        return

    init_db()
    with get_connection() as conn:
        with conn:
            m = ingest_markets(conn, paths["markets"])
            t = ingest_trades(conn, paths["trades"])
            o = ingest_outcomes(conn, paths["outcomes"])
            r = recompute_pipeline(conn, include_resolved_snapshots=True)
            b = run_backtest(conn, cutoff_hours=1.0)
        print(f"Ingested: markets={m}, trades_inserted={t['inserted']}, trades_skipped={t['skipped']}, outcomes={o}")
        print(f"Pipeline: {r}")
        print(
            "Backtest:",
            {
                "run_id": b.get("run_id"),
                "markets_evaluated": b.get("markets_evaluated"),
                "brier": b.get("brier"),
                "log_loss": b.get("log_loss"),
            },
        )


if __name__ == "__main__":
    main()

