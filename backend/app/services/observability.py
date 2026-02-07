from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone

from app.db import now_utc_iso

LOGGER = logging.getLogger("smartcrowd.obs")


def _parse_iso(ts: str) -> datetime:
    raw = ts
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def start_pipeline_run(conn: sqlite3.Connection, run_type: str, metadata: dict | None = None) -> str:
    run_id = uuid.uuid4().hex
    conn.execute(
        """
        INSERT INTO pipeline_runs (run_id, run_type, status, started_at, metrics_json)
        VALUES (?, ?, 'running', ?, ?)
        """,
        (run_id, run_type, now_utc_iso(), json.dumps(metadata or {})),
    )
    return run_id


def finish_pipeline_run(
    conn: sqlite3.Connection,
    run_id: str,
    status: str,
    metrics: dict | None = None,
    error_text: str | None = None,
) -> None:
    row = conn.execute(
        "SELECT run_type, started_at FROM pipeline_runs WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    finished_at = now_utc_iso()
    duration_ms = None
    run_type = "unknown"
    if row:
        run_type = row["run_type"]
        try:
            duration_ms = (_parse_iso(finished_at) - _parse_iso(row["started_at"])).total_seconds() * 1000.0
        except Exception:
            duration_ms = None

    conn.execute(
        """
        UPDATE pipeline_runs
        SET status = ?, finished_at = ?, duration_ms = ?, metrics_json = ?, error_text = ?
        WHERE run_id = ?
        """,
        (
            status,
            finished_at,
            duration_ms,
            json.dumps(metrics or {}),
            (error_text or "")[:4000] if error_text else None,
            run_id,
        ),
    )

    if duration_ms is not None:
        record_operation_metric(conn, run_type, duration_ms=duration_ms, success=status == "success")
    increment_metric(conn, f"pipeline.{run_type}.{status}.count", 1.0)


def increment_metric(conn: sqlite3.Connection, metric_key: str, delta: float = 1.0) -> None:
    conn.execute(
        """
        INSERT INTO system_metrics (metric_key, metric_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(metric_key) DO UPDATE SET
          metric_value = system_metrics.metric_value + excluded.metric_value,
          updated_at = excluded.updated_at
        """,
        (metric_key, delta, now_utc_iso()),
    )


def set_metric_max(conn: sqlite3.Connection, metric_key: str, value: float) -> None:
    conn.execute(
        """
        INSERT INTO system_metrics (metric_key, metric_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(metric_key) DO UPDATE SET
          metric_value = MAX(system_metrics.metric_value, excluded.metric_value),
          updated_at = excluded.updated_at
        """,
        (metric_key, value, now_utc_iso()),
    )


def set_metric(conn: sqlite3.Connection, metric_key: str, value: float) -> None:
    conn.execute(
        """
        INSERT INTO system_metrics (metric_key, metric_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(metric_key) DO UPDATE SET
          metric_value = excluded.metric_value,
          updated_at = excluded.updated_at
        """,
        (metric_key, value, now_utc_iso()),
    )


def record_operation_metric(
    conn: sqlite3.Connection,
    operation: str,
    duration_ms: float,
    success: bool,
) -> None:
    safe_op = operation.replace(" ", "_").replace("/", "_")
    increment_metric(conn, f"ops.{safe_op}.count", 1.0)
    increment_metric(conn, f"ops.{safe_op}.success_count" if success else f"ops.{safe_op}.error_count", 1.0)
    increment_metric(conn, f"ops.{safe_op}.duration_ms.sum", float(duration_ms))
    set_metric_max(conn, f"ops.{safe_op}.duration_ms.max", float(duration_ms))
    set_metric(conn, f"ops.{safe_op}.duration_ms.last", float(duration_ms))


def fetch_recent_runs(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        """
        SELECT run_id, run_type, status, started_at, finished_at, duration_ms, metrics_json, error_text
        FROM pipeline_runs
        ORDER BY started_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    payload: list[dict] = []
    for row in rows:
        metrics = {}
        if row["metrics_json"]:
            try:
                metrics = json.loads(row["metrics_json"])
            except json.JSONDecodeError:
                metrics = {}
        payload.append(
            {
                "run_id": row["run_id"],
                "run_type": row["run_type"],
                "status": row["status"],
                "started_at": row["started_at"],
                "finished_at": row["finished_at"],
                "duration_ms": row["duration_ms"],
                "metrics": metrics,
                "error_text": row["error_text"],
            }
        )
    return payload


def fetch_system_metrics(conn: sqlite3.Connection) -> dict[str, float]:
    rows = conn.execute(
        """
        SELECT metric_key, metric_value
        FROM system_metrics
        ORDER BY metric_key ASC
        """
    ).fetchall()
    return {str(r["metric_key"]): float(r["metric_value"]) for r in rows}

