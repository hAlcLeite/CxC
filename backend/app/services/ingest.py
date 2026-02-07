from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from app.db import now_utc_iso


def _parse_timestamp(value: str) -> str:
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _normalize_side(value: str) -> str:
    side = value.strip().upper()
    if side in {"YES", "Y", "1", "TRUE"}:
        return "YES"
    if side in {"NO", "N", "0", "FALSE"}:
        return "NO"
    raise ValueError(f"Unsupported side value: {value!r}")


def _normalize_action(value: str | None) -> str:
    if not value:
        return "BUY"
    action = value.strip().upper()
    if action in {"BUY", "B"}:
        return "BUY"
    if action in {"SELL", "S"}:
        return "SELL"
    raise ValueError(f"Unsupported action value: {value!r}")


def _read_csv(path: str | Path) -> list[dict[str, str]]:
    csv_path = Path(path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file does not exist: {csv_path}")
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _to_float(value: str | None, default: float = 0.0) -> float:
    if value is None or str(value).strip() == "":
        return default
    return float(value)


def _ensure_markets_exist(conn: sqlite3.Connection, market_ids: Iterable[str]) -> None:
    market_ids = {m for m in market_ids if m}
    if not market_ids:
        return
    placeholders = [
        (
            market_id,
            f"Unknown market {market_id}",
            (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "unknown",
            0.0,
            "",
            now_utc_iso(),
        )
        for market_id in market_ids
    ]
    conn.executemany(
        """
        INSERT INTO markets (id, question, end_time, category, liquidity, resolution_source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
        """,
        placeholders,
    )


def ingest_markets(conn: sqlite3.Connection, path: str | Path) -> int:
    rows = _read_csv(path)
    payload: list[tuple[str, str, str, str, float, str, str]] = []
    for row in rows:
        market_id = (row.get("id") or row.get("market_id") or "").strip()
        if not market_id:
            continue
        end_time = row.get("end_time") or row.get("close_time")
        if not end_time:
            continue
        payload.append(
            (
                market_id,
                (row.get("question") or row.get("title") or "").strip(),
                _parse_timestamp(end_time),
                (row.get("category") or "unknown").strip().lower(),
                _to_float(row.get("liquidity"), 0.0),
                (row.get("resolution_source") or "").strip(),
                now_utc_iso(),
            )
        )
    conn.executemany(
        """
        INSERT INTO markets (id, question, end_time, category, liquidity, resolution_source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          question = excluded.question,
          end_time = excluded.end_time,
          category = excluded.category,
          liquidity = excluded.liquidity,
          resolution_source = excluded.resolution_source
        """,
        payload,
    )
    return len(payload)


def ingest_outcomes(conn: sqlite3.Connection, path: str | Path) -> int:
    rows = _read_csv(path)
    payload: list[tuple[str, int, str]] = []
    for row in rows:
        market_id = (row.get("market_id") or row.get("id") or "").strip()
        if not market_id:
            continue
        raw_outcome = (row.get("resolved_outcome") or row.get("outcome") or "").strip().upper()
        if raw_outcome in {"YES", "Y", "TRUE", "1"}:
            outcome = 1
        elif raw_outcome in {"NO", "N", "FALSE", "0"}:
            outcome = 0
        else:
            continue
        resolution_time = row.get("resolution_time") or row.get("resolved_at")
        if not resolution_time:
            continue
        payload.append((market_id, outcome, _parse_timestamp(resolution_time)))

    _ensure_markets_exist(conn, (market_id for market_id, _, _ in payload))
    conn.executemany(
        """
        INSERT INTO outcomes (market_id, resolved_outcome, resolution_time)
        VALUES (?, ?, ?)
        ON CONFLICT(market_id) DO UPDATE SET
          resolved_outcome = excluded.resolved_outcome,
          resolution_time = excluded.resolution_time
        """,
        payload,
    )
    return len(payload)


def ingest_trades(conn: sqlite3.Connection, path: str | Path) -> dict[str, int]:
    rows = _read_csv(path)
    payload: list[tuple[str, str, str, str, str, str, float, float, float | None, str | None, str]] = []
    skipped = 0
    market_ids: set[str] = set()

    for row in rows:
        try:
            market_id = (row.get("market_id") or row.get("id") or "").strip()
            wallet = (row.get("wallet") or row.get("wallet_address") or "").strip().lower()
            ts = row.get("timestamp") or row.get("ts") or row.get("time")
            side = row.get("side")
            price = row.get("price")
            size = row.get("size")
            if not all([market_id, wallet, ts, side, price, size]):
                skipped += 1
                continue

            normalized_ts = _parse_timestamp(ts)
            normalized_side = _normalize_side(side)
            normalized_action = _normalize_action(row.get("action"))
            normalized_price = float(price)
            normalized_size = float(size)
            if normalized_price < 0 or normalized_price > 1 or normalized_size <= 0:
                skipped += 1
                continue

            raw_external_id = (row.get("external_id") or row.get("trade_id") or "").strip()
            external_id = raw_external_id
            if not external_id:
                digest_input = "|".join(
                    [
                        market_id,
                        wallet,
                        normalized_ts,
                        normalized_side,
                        normalized_action,
                        f"{normalized_price:.8f}",
                        f"{normalized_size:.8f}",
                    ]
                )
                external_id = hashlib.sha1(digest_input.encode("utf-8")).hexdigest()

            aggressiveness_value = row.get("aggressiveness")
            aggressiveness = float(aggressiveness_value) if aggressiveness_value else None
            maker_taker = (row.get("maker_taker") or row.get("liquidity_flag") or "").strip() or None
            payload.append(
                (
                    external_id,
                    market_id,
                    wallet,
                    normalized_ts,
                    normalized_side,
                    normalized_action,
                    normalized_price,
                    normalized_size,
                    aggressiveness,
                    maker_taker,
                    json.dumps(row, separators=(",", ":"), sort_keys=True),
                )
            )
            market_ids.add(market_id)
        except (TypeError, ValueError):
            skipped += 1

    _ensure_markets_exist(conn, market_ids)
    before = conn.total_changes
    conn.executemany(
        """
        INSERT INTO trades (
          external_id, market_id, wallet, ts, side, action, price, size,
          aggressiveness, maker_taker, raw_payload
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_id) DO NOTHING
        """,
        payload,
    )
    inserted = conn.total_changes - before
    return {"inserted": inserted, "skipped": skipped}

