from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.db import now_utc_iso

GAMMA_BASE_URL = "https://gamma-api.polymarket.com"
DATA_BASE_URL = "https://data-api.polymarket.com"


def _to_iso_datetime(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()

    raw = str(value).strip()
    if not raw:
        return None

    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    if " " in raw and "T" not in raw:
        raw = raw.replace(" ", "T", 1)
    if raw.endswith("+00"):
        raw = raw + ":00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        try:
            dt = datetime.fromtimestamp(float(raw), tz=timezone.utc)
        except (TypeError, ValueError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _load_jsonish_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            loaded = json.loads(raw)
            return loaded if isinstance(loaded, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _http_get_json(url: str, params: dict[str, Any] | None = None, timeout: int = 30) -> Any:
    query = urlencode({k: v for k, v in (params or {}).items() if v is not None})
    full_url = f"{url}?{query}" if query else url
    req = Request(full_url, headers={"User-Agent": "smartcrowd-backend/0.1"})
    with urlopen(req, timeout=timeout) as resp:
        payload = resp.read().decode("utf-8")
    return json.loads(payload)


def _fetch_markets(closed: bool, total_limit: int, page_size: int = 200) -> list[dict]:
    if total_limit <= 0:
        return []
    results: list[dict] = []
    offset = 0
    while len(results) < total_limit:
        limit = min(page_size, total_limit - len(results))
        rows = _http_get_json(
            f"{GAMMA_BASE_URL}/markets",
            {"closed": str(closed).lower(), "limit": limit, "offset": offset},
        )
        if not isinstance(rows, list) or not rows:
            break
        results.extend(rows)
        if len(rows) < limit:
            break
        offset += len(rows)
    return results


def _infer_binary_resolution(market_row: dict, threshold: float = 0.97) -> tuple[int, str] | None:
    outcome_prices = _load_jsonish_list(market_row.get("outcomePrices"))
    if len(outcome_prices) < 2:
        return None
    try:
        first = float(outcome_prices[0])
        second = float(outcome_prices[1])
    except (TypeError, ValueError):
        return None
    top = max(first, second)
    if top < threshold or abs(first - second) < 1e-9:
        return None
    resolved_outcome = 1 if first > second else 0
    resolution_time = (
        _to_iso_datetime(market_row.get("closedTime"))
        or _to_iso_datetime(market_row.get("endDate"))
        or _to_iso_datetime(market_row.get("updatedAt"))
    )
    if resolution_time is None:
        return None
    return resolved_outcome, resolution_time


def _normalize_trade_row(trade: dict, market_by_condition: dict[str, dict]) -> tuple | None:
    condition_id = str(trade.get("conditionId") or "").strip().lower()
    if not condition_id:
        return None
    market = market_by_condition.get(condition_id)
    if market is None:
        return None

    outcome_index = trade.get("outcomeIndex")
    if outcome_index is None:
        return None
    try:
        idx = int(outcome_index)
    except (TypeError, ValueError):
        return None
    if idx not in (0, 1):
        return None

    wallet = str(trade.get("proxyWallet") or "").strip().lower()
    if not wallet:
        return None

    timestamp_iso = _to_iso_datetime(trade.get("timestamp"))
    if timestamp_iso is None:
        return None

    side = "YES" if idx == 0 else "NO"
    action = str(trade.get("side") or "BUY").upper()
    if action not in {"BUY", "SELL"}:
        action = "BUY"
    price = _to_float(trade.get("price"), default=-1.0)
    size = _to_float(trade.get("size"), default=-1.0)
    if not (0.0 <= price <= 1.0) or size <= 0:
        return None

    tx_hash = str(trade.get("transactionHash") or "").strip().lower()
    asset = str(trade.get("asset") or "").strip().lower()
    unique_material = "|".join(
        [
            tx_hash,
            asset,
            wallet,
            str(market["id"]),
            timestamp_iso,
            side,
            action,
            f"{price:.10f}",
            f"{size:.10f}",
        ]
    )
    external_id = hashlib.sha1(unique_material.encode("utf-8")).hexdigest()
    maker_taker = "taker" if action == "BUY" else "maker"

    return (
        external_id,
        str(market["id"]),
        wallet,
        timestamp_iso,
        side,
        action,
        price,
        size,
        None,
        maker_taker,
        json.dumps(trade, separators=(",", ":"), sort_keys=True),
    )


def ingest_polymarket(
    conn: sqlite3.Connection,
    include_active_markets: bool = True,
    include_closed_markets: bool = True,
    active_markets_limit: int = 200,
    closed_markets_limit: int = 400,
    trades_per_market: int = 400,
    trade_page_size: int = 200,
    market_chunk_size: int = 10,
    taker_only: bool = False,
    min_trade_timestamp: int | None = None,
    max_trade_timestamp: int | None = None,
) -> dict[str, int]:
    fetched_active = _fetch_markets(closed=False, total_limit=active_markets_limit) if include_active_markets else []
    fetched_closed = _fetch_markets(closed=True, total_limit=closed_markets_limit) if include_closed_markets else []
    fetched_markets = fetched_active + fetched_closed

    markets_payload: list[tuple] = []
    market_by_condition: dict[str, dict] = {}
    known_market_ids: set[str] = set()
    for market in fetched_markets:
        market_id = str(market.get("id") or "").strip()
        condition_id = str(market.get("conditionId") or "").strip().lower()
        end_time = _to_iso_datetime(market.get("endDate"))
        if not market_id or not condition_id or not end_time:
            continue
        normalized = {
            "id": market_id,
            "condition_id": condition_id,
            "question": str(market.get("question") or "").strip(),
            "category": str(market.get("category") or "unknown").strip().lower(),
            "liquidity": _to_float(
                market.get("liquidityNum"),
                default=_to_float(market.get("liquidity"), default=0.0),
            ),
            "resolution_source": str(market.get("resolutionSource") or "").strip(),
            "end_time": end_time,
        }
        market_by_condition[condition_id] = normalized
        known_market_ids.add(market_id)
        markets_payload.append(
            (
                normalized["id"],
                normalized["question"],
                normalized["end_time"],
                normalized["category"],
                normalized["liquidity"],
                normalized["resolution_source"],
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
        markets_payload,
    )

    outcomes_payload: list[tuple] = []
    for market in fetched_closed:
        market_id = str(market.get("id") or "").strip()
        if not market_id or market_id not in known_market_ids:
            continue
        inferred = _infer_binary_resolution(market)
        if inferred is None:
            continue
        resolved_outcome, resolution_time = inferred
        outcomes_payload.append((market_id, resolved_outcome, resolution_time))
    conn.executemany(
        """
        INSERT INTO outcomes (market_id, resolved_outcome, resolution_time)
        VALUES (?, ?, ?)
        ON CONFLICT(market_id) DO UPDATE SET
          resolved_outcome = excluded.resolved_outcome,
          resolution_time = excluded.resolution_time
        """,
        outcomes_payload,
    )

    condition_ids = list(market_by_condition.keys())
    trade_rows: list[tuple] = []
    skipped = 0
    trades_fetched = 0
    for start in range(0, len(condition_ids), market_chunk_size):
        chunk = condition_ids[start : start + market_chunk_size]
        if not chunk:
            continue
        chunk_budget = trades_per_market * len(chunk)
        chunk_fetched = 0
        offset = 0
        market_param = ",".join(chunk)
        while chunk_fetched < chunk_budget:
            page_limit = min(trade_page_size, chunk_budget - chunk_fetched)
            params: dict[str, Any] = {
                "limit": page_limit,
                "offset": offset,
                "market": market_param,
                "takerOnly": str(taker_only).lower(),
            }
            if min_trade_timestamp is not None:
                params["timestamp_start"] = min_trade_timestamp
            if max_trade_timestamp is not None:
                params["timestamp_end"] = max_trade_timestamp
            page = _http_get_json(f"{DATA_BASE_URL}/trades", params=params)
            if not isinstance(page, list) or not page:
                break
            for tr in page:
                normalized = _normalize_trade_row(tr, market_by_condition)
                if normalized is None:
                    skipped += 1
                    continue
                trade_rows.append(normalized)
            fetched = len(page)
            trades_fetched += fetched
            chunk_fetched += fetched
            if fetched < page_limit:
                break
            offset += fetched

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
        trade_rows,
    )
    inserted = conn.total_changes - before

    return {
        "markets_fetched_active": len(fetched_active),
        "markets_fetched_closed": len(fetched_closed),
        "markets_upserted": len(markets_payload),
        "outcomes_upserted": len(outcomes_payload),
        "condition_ids_indexed": len(condition_ids),
        "trades_fetched": trades_fetched,
        "trades_inserted": inserted,
        "trades_skipped": skipped,
    }
