from __future__ import annotations

import json
import logging
import sqlite3
import time
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import DB_PATH
from app.db import get_connection, init_db
from app.schemas import (
    BacktestRequest,
    GenericResponse,
    HealthResponse,
    IngestRequest,
    IngestResponse,
    PolymarketIngestRequest,
    RecomputeRequest,
)
from app.services.backtest import run_backtest
from app.services.beliefs import yes_direction
from app.services.ingest import ingest_markets, ingest_outcomes, ingest_trades
from app.services.observability import (
    fetch_recent_runs,
    fetch_system_metrics,
    finish_pipeline_run,
    increment_metric,
    start_pipeline_run,
)
from app.services.pipeline import recompute_pipeline
from app.services.polymarket import ingest_polymarket
from app.services.precognition import build_market_snapshot, latest_screener_rows
from app.services.backboard import explain_divergence as generate_ai_explanation


def create_app() -> FastAPI:
    app = FastAPI(title="Precognition Backend MVP", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger = logging.getLogger("precognition.api")

    @app.on_event("startup")
    def _startup() -> None:
        init_db()

    @contextmanager
    def _conn_ctx() -> sqlite3.Connection:
        conn = get_connection()
        try:
            yield conn
        finally:
            conn.close()

    def get_conn() -> sqlite3.Connection:
        with _conn_ctx() as conn:
            yield conn

    @app.middleware("http")
    async def request_logging_middleware(request, call_next):
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = (time.perf_counter() - started) * 1000.0
            route = request.scope.get("route")
            route_path = getattr(route, "path", request.url.path)
            payload = {
                "event": "http_request",
                "method": request.method,
                "path": request.url.path,
                "route": route_path,
                "status_code": status_code,
                "duration_ms": round(duration_ms, 3),
            }
            logger.info(json.dumps(payload, separators=(",", ":"), sort_keys=True))

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.post("/ingest/csv", response_model=IngestResponse)
    def ingest_csv(req: IngestRequest, conn: sqlite3.Connection = Depends(get_conn)) -> IngestResponse:
        if not req.markets_path and not req.trades_path and not req.outcomes_path:
            raise HTTPException(status_code=400, detail="Provide at least one CSV path.")

        with conn:
            run_id = start_pipeline_run(
                conn,
                "ingest_csv",
                metadata={
                    "markets_path": bool(req.markets_path),
                    "trades_path": bool(req.trades_path),
                    "outcomes_path": bool(req.outcomes_path),
                },
            )
        started = time.perf_counter()
        ingested: dict[str, int] = {}
        try:
            with conn:
                if req.markets_path:
                    ingested["markets"] = ingest_markets(conn, req.markets_path)
                if req.trades_path:
                    trade_result = ingest_trades(conn, req.trades_path)
                    ingested["trades_inserted"] = trade_result["inserted"]
                    ingested["trades_skipped"] = trade_result["skipped"]
                if req.outcomes_path:
                    ingested["outcomes"] = ingest_outcomes(conn, req.outcomes_path)
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_id,
                    "success",
                    metrics={"ingested": ingested, "duration_ms": duration_ms},
                )
            return IngestResponse(ingested=ingested, db_path=str(DB_PATH))
        except Exception as exc:
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_id,
                    "failed",
                    metrics={"duration_ms": duration_ms},
                    error_text=str(exc),
                )
                increment_metric(conn, "errors.ingest_csv", 1.0)
            logger.exception("ingest_csv failed")
            raise HTTPException(status_code=500, detail=str(exc))


    @app.post("/ingest/polymarket", response_model=GenericResponse)
    def ingest_live_polymarket(
        req: PolymarketIngestRequest,
        run_recompute: bool = Query(default=True),
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> GenericResponse:
        with conn:
            run_id = start_pipeline_run(
                conn,
                "ingest_polymarket",
                metadata={
                    "run_recompute": run_recompute,
                    "active_markets_limit": req.active_markets_limit,
                    "closed_markets_limit": req.closed_markets_limit,
                    "trades_per_market": req.trades_per_market,
                    "trade_page_size": req.trade_page_size,
                    "market_chunk_size": req.market_chunk_size,
                    "use_incremental_checkpoint": req.use_incremental_checkpoint,
                },
            )
        started = time.perf_counter()
        try:
            with conn:
                ingest_result = ingest_polymarket(
                    conn,
                    include_active_markets=req.include_active_markets,
                    include_closed_markets=req.include_closed_markets,
                    active_markets_limit=req.active_markets_limit,
                    closed_markets_limit=req.closed_markets_limit,
                    trades_per_market=req.trades_per_market,
                    trade_page_size=req.trade_page_size,
                    market_chunk_size=req.market_chunk_size,
                    taker_only=req.taker_only,
                    min_trade_timestamp=req.min_trade_timestamp,
                    max_trade_timestamp=req.max_trade_timestamp,
                    use_incremental_checkpoint=req.use_incremental_checkpoint,
                    checkpoint_lookback_seconds=req.checkpoint_lookback_seconds,
                    reset_checkpoint=req.reset_checkpoint,
                    request_delay_ms=req.request_delay_ms,
                )
                pipeline_result: dict[str, int] | None = None
                if run_recompute:
                    pipeline_result = recompute_pipeline(conn, include_resolved_snapshots=True)
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_id,
                    "success",
                    metrics={
                        "ingest": ingest_result,
                        "pipeline": pipeline_result or {},
                        "duration_ms": duration_ms,
                    },
                )
            return GenericResponse(
                result={
                    "source": "polymarket_api",
                    "run_id": run_id,
                    "ingest": ingest_result,
                    "pipeline": pipeline_result,
                    "db_path": str(DB_PATH),
                }
            )
        except Exception as exc:
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_id,
                    "failed",
                    metrics={"duration_ms": duration_ms},
                    error_text=str(exc),
                )
                increment_metric(conn, "errors.ingest_polymarket", 1.0)
            logger.exception("ingest_polymarket failed")
            raise HTTPException(status_code=500, detail=str(exc))

    @app.post("/pipeline/recompute", response_model=GenericResponse)
    def recompute(req: RecomputeRequest, conn: sqlite3.Connection = Depends(get_conn)) -> GenericResponse:
        with conn:
            run_id = start_pipeline_run(
                conn,
                "recompute",
                metadata={"include_resolved_snapshots": req.include_resolved_snapshots},
            )
        started = time.perf_counter()
        try:
            with conn:
                result = recompute_pipeline(
                    conn,
                    snapshot_time=req.snapshot_time,
                    include_resolved_snapshots=req.include_resolved_snapshots,
                )
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_id,
                    "success",
                    metrics={"result": result, "duration_ms": duration_ms},
                )
            return GenericResponse(result={"run_id": run_id, **result})
        except Exception as exc:
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_id,
                    "failed",
                    metrics={"duration_ms": duration_ms},
                    error_text=str(exc),
                )
                increment_metric(conn, "errors.recompute", 1.0)
            logger.exception("recompute failed")
            raise HTTPException(status_code=500, detail=str(exc))

    @app.get("/screener", response_model=GenericResponse)
    def screener(
        limit: int = Query(default=25, ge=1, le=200),
        min_confidence: float = Query(default=0.0, ge=0.0, le=1.0),
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> GenericResponse:
        rows = latest_screener_rows(conn, limit=limit, min_confidence=min_confidence)
        payload = []
        for row in rows:
            top_drivers = json.loads(row["top_drivers"]) if row["top_drivers"] else []
            cohort_summary = json.loads(row["cohort_summary"]) if row["cohort_summary"] else []
            payload.append(
                {
                    "market_id": row["market_id"],
                    "question": row["question"],
                    "category": row["category"],
                    "end_time": row["end_time"],
                    "snapshot_time": row["snapshot_time"],
                    "market_prob": row["market_prob"],
                    "precognition_prob": row["precognition_prob"],
                    "divergence": row["divergence"],
                    "confidence": row["confidence"],
                    "disagreement": row["disagreement"],
                    "participation_quality": row["participation_quality"],
                    "integrity_risk": row["integrity_risk"],
                    "active_wallets": row["active_wallets"],
                    "top_drivers": top_drivers[:5],
                    "top_cohorts": cohort_summary[:3],
                }
            )
        return GenericResponse(result={"count": len(payload), "markets": payload})

    @app.get("/markets/{market_id}", response_model=GenericResponse)
    def market_detail(
        market_id: str,
        history_points: int = Query(default=60, ge=5, le=500),
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> GenericResponse:
        market = conn.execute(
            "SELECT id, question, category, end_time, liquidity FROM markets WHERE id = ?",
            (market_id,),
        ).fetchone()
        if not market:
            raise HTTPException(status_code=404, detail=f"Market not found: {market_id}")

        latest = conn.execute(
            """
            SELECT *
            FROM precognition_snapshots
            WHERE market_id = ?
            ORDER BY snapshot_time DESC
            LIMIT 1
            """,
            (market_id,),
        ).fetchone()
        if not latest:
            with conn:
                snapshot = build_market_snapshot(conn, market_id, persist=True)
            latest = conn.execute(
                """
                SELECT *
                FROM precognition_snapshots
                WHERE market_id = ?
                ORDER BY snapshot_time DESC
                LIMIT 1
                """,
                (market_id,),
            ).fetchone()
            if not latest:
                raise HTTPException(status_code=500, detail="Failed to compute market snapshot.")

        time_series = conn.execute(
            """
            SELECT snapshot_time, market_prob, precognition_prob, divergence, confidence
            FROM precognition_snapshots
            WHERE market_id = ?
            ORDER BY snapshot_time DESC
            LIMIT ?
            """,
            (market_id, history_points),
        ).fetchall()

        trade_rows = conn.execute(
            """
            SELECT side, action, size
            FROM trades
            WHERE market_id = ?
            ORDER BY ts DESC
            LIMIT 2000
            """,
            (market_id,),
        ).fetchall()
        net_yes_flow = 0.0
        for tr in trade_rows:
            direction = yes_direction(tr["side"], tr["action"])
            net_yes_flow += direction * float(tr["size"])

        smart_prob = float(latest["precognition_prob"])
        market_prob = float(latest["market_prob"])
        confidence = float(latest["confidence"])
        top_drivers = json.loads(latest["top_drivers"]) if latest["top_drivers"] else []
        explanation_artifacts = json.loads(latest["explanation_json"]) if latest["explanation_json"] else {}
        if smart_prob > market_prob:
            directional = "net buying YES"
        elif smart_prob < market_prob:
            directional = "net buying NO"
        else:
            directional = "balanced flow"
        fallback_explanation = (
            f"Market implied is {market_prob:.3f}, Precognition is {smart_prob:.3f} with "
            f"confidence {confidence:.2f}, driven by trusted cohorts {directional}."
        )
        explanation = explanation_artifacts.get("summary", fallback_explanation) if explanation_artifacts else fallback_explanation

        return GenericResponse(
            result={
                "market": {
                    "id": market["id"],
                    "question": market["question"],
                    "category": market["category"],
                    "end_time": market["end_time"],
                    "liquidity": market["liquidity"],
                },
                "latest_snapshot": {
                    "snapshot_time": latest["snapshot_time"],
                    "market_prob": market_prob,
                    "precognition_prob": smart_prob,
                    "divergence": latest["divergence"],
                    "confidence": confidence,
                    "disagreement": latest["disagreement"],
                    "participation_quality": latest["participation_quality"],
                    "integrity_risk": latest["integrity_risk"],
                    "active_wallets": latest["active_wallets"],
                    "top_drivers": top_drivers,
                    "cohort_summary": json.loads(latest["cohort_summary"]) if latest["cohort_summary"] else [],
                    "flip_conditions": json.loads(latest["flip_conditions"]) if latest["flip_conditions"] else [],
                    "explanation_artifacts": explanation_artifacts,
                },
                "time_series": [dict(row) for row in reversed(time_series)],
                "flow_summary": {"net_yes_flow_size": net_yes_flow, "trade_count": len(trade_rows)},
                "explanation": explanation,
            }
        )

    @app.post("/markets/{market_id}/explain", response_model=GenericResponse)
    def explain_market(
        market_id: str,
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> GenericResponse:
        """Generate AI explanation for market divergence using Backboard.io + Gemini."""
        # Get market info
        market = conn.execute(
            "SELECT id, question, category, end_time, liquidity FROM markets WHERE id = ?",
            (market_id,),
        ).fetchone()
        if not market:
            raise HTTPException(status_code=404, detail=f"Market not found: {market_id}")

        # Get latest snapshot
        latest = conn.execute(
            """
            SELECT *
            FROM precognition_snapshots
            WHERE market_id = ?
            ORDER BY snapshot_time DESC
            LIMIT 1
            """,
            (market_id,),
        ).fetchone()
        if not latest:
            raise HTTPException(
                status_code=404, 
                detail=f"No snapshot found for market: {market_id}"
            )

        # Build context for AI
        context = {
            "market_id": market_id,
            "question": market["question"],
            "category": market["category"],
            "market_prob": float(latest["market_prob"]),
            "precognition_prob": float(latest["precognition_prob"]),
            "divergence": float(latest["divergence"]),
            "confidence": float(latest["confidence"]),
            "integrity_risk": float(latest["integrity_risk"]),
            "active_wallets": latest["active_wallets"],
            "top_drivers": json.loads(latest["top_drivers"]) if latest["top_drivers"] else [],
            "cohort_summary": json.loads(latest["cohort_summary"]) if latest["cohort_summary"] else [],
        }

        # Generate AI explanation (rate limited & cached)
        result = generate_ai_explanation(context)

        if result.get("error"):
            if result.get("rate_limited"):
                raise HTTPException(status_code=429, detail=result["error"])
            raise HTTPException(status_code=500, detail=result["error"])

        return GenericResponse(
            result={
                "market_id": market_id,
                "explanation": result.get("explanation"),
                "cached": result.get("cached", False),
            }
        )

    @app.get("/wallets/{wallet}", response_model=GenericResponse)
    def wallet_detail(wallet: str, conn: sqlite3.Connection = Depends(get_conn)) -> GenericResponse:
        normalized_wallet = wallet.lower()
        metrics = conn.execute(
            """
            SELECT *
            FROM wallet_metrics
            WHERE wallet = ?
            ORDER BY category, horizon_bucket
            """,
            (normalized_wallet,),
        ).fetchall()
        weights = conn.execute(
            """
            SELECT *
            FROM wallet_weights
            WHERE wallet = ?
            ORDER BY category, horizon_bucket
            """,
            (normalized_wallet,),
        ).fetchall()

        trade_summary = None
        if not metrics and not weights:
            summary_row = conn.execute(
                """
                SELECT
                  COUNT(*) AS trade_count,
                  COUNT(DISTINCT market_id) AS market_count,
                  MIN(ts) AS first_trade,
                  MAX(ts) AS last_trade,
                  SUM(price * size) AS total_volume,
                  AVG(price) AS avg_price,
                  AVG(size) AS avg_size
                FROM trades
                WHERE wallet = ?
                """,
                (normalized_wallet,),
            ).fetchone()
            if not summary_row or summary_row["trade_count"] == 0:
                raise HTTPException(status_code=404, detail=f"Wallet not found: {normalized_wallet}")
            trade_summary = dict(summary_row)

            recent_trades = conn.execute(
                """
                SELECT market_id, ts, side, action, price, size, m.question
                FROM trades t
                LEFT JOIN markets m ON m.id = t.market_id
                WHERE t.wallet = ?
                ORDER BY t.ts DESC
                LIMIT 20
                """,
                (normalized_wallet,),
            ).fetchall()
            trade_summary["recent_trades"] = [dict(r) for r in recent_trades]

        return GenericResponse(
            result={
                "wallet": normalized_wallet,
                "metrics": [dict(r) for r in metrics],
                "weights": [dict(r) for r in weights],
                "trade_summary": trade_summary,
            }
        )

    @app.post("/backtest", response_model=GenericResponse)
    def backtest(req: BacktestRequest, conn: sqlite3.Connection = Depends(get_conn)) -> GenericResponse:
        with conn:
            run_track_id = start_pipeline_run(
                conn,
                "backtest",
                metadata={"cutoff_hours": req.cutoff_hours, "requested_run_id": req.run_id},
            )
        started = time.perf_counter()
        try:
            with conn:
                summary = run_backtest(conn, cutoff_hours=req.cutoff_hours, run_id=req.run_id)
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_track_id,
                    "success",
                    metrics={
                        "run_id": summary.get("run_id"),
                        "markets_evaluated": summary.get("markets_evaluated"),
                        "duration_ms": duration_ms,
                    },
                )
            return GenericResponse(result={"tracking_run_id": run_track_id, **summary})
        except Exception as exc:
            duration_ms = (time.perf_counter() - started) * 1000.0
            with conn:
                finish_pipeline_run(
                    conn,
                    run_track_id,
                    "failed",
                    metrics={"duration_ms": duration_ms},
                    error_text=str(exc),
                )
                increment_metric(conn, "errors.backtest", 1.0)
            logger.exception("backtest failed")
            raise HTTPException(status_code=500, detail=str(exc))

    @app.get("/backtest/{run_id}", response_model=GenericResponse)
    def get_backtest(run_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> GenericResponse:
        row = conn.execute(
            "SELECT summary_json FROM backtest_reports WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Backtest run not found: {run_id}")
        return GenericResponse(result=json.loads(row["summary_json"]))

    @app.get("/alerts", response_model=GenericResponse)
    def alerts(
        divergence_threshold: float = Query(default=0.08, ge=0.01, le=0.5),
        integrity_risk_threshold: float = Query(default=0.65, ge=0.0, le=1.0),
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> GenericResponse:
        rows = conn.execute(
            """
            WITH ranked AS (
              SELECT
                market_id,
                snapshot_time,
                divergence,
                confidence,
                integrity_risk,
                ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY snapshot_time DESC) AS rn
              FROM precognition_snapshots
            )
            SELECT
              r.market_id,
              r.snapshot_time,
              r.divergence,
              r.confidence,
              r.integrity_risk,
              m.question,
              m.category,
              p.divergence AS prev_divergence
            FROM ranked r
            JOIN markets m ON m.id = r.market_id
            LEFT JOIN ranked p
              ON p.market_id = r.market_id
             AND p.rn = 2
            WHERE r.rn = 1
            """
        ).fetchall()

        alerts_payload: list[dict] = []
        for row in rows:
            divergence = float(row["divergence"])
            confidence = float(row["confidence"])
            integrity_risk = float(row["integrity_risk"])
            prev_divergence = row["prev_divergence"]

            if abs(divergence) >= divergence_threshold and confidence >= 0.5:
                alerts_payload.append(
                    {
                        "type": "trusted_cohort_regime_shift",
                        "market_id": row["market_id"],
                        "question": row["question"],
                        "category": row["category"],
                        "snapshot_time": row["snapshot_time"],
                        "detail": f"Divergence {divergence:.3f} with confidence {confidence:.2f}.",
                    }
                )

            if integrity_risk >= integrity_risk_threshold:
                alerts_payload.append(
                    {
                        "type": "integrity_risk_spike",
                        "market_id": row["market_id"],
                        "question": row["question"],
                        "category": row["category"],
                        "snapshot_time": row["snapshot_time"],
                        "detail": f"Integrity risk at {integrity_risk:.2f}.",
                    }
                )

            if prev_divergence is not None:
                prev_val = float(prev_divergence)
                if divergence * prev_val < 0:
                    alerts_payload.append(
                        {
                            "type": "precognition_crossed_market",
                            "market_id": row["market_id"],
                            "question": row["question"],
                            "category": row["category"],
                            "snapshot_time": row["snapshot_time"],
                            "detail": (
                                f"Divergence crossed zero from {prev_val:.3f} to {divergence:.3f}."
                            ),
                        }
                    )

        grouped = defaultdict(list)
        for alert in alerts_payload:
            grouped[alert["type"]].append(alert)
        return GenericResponse(result={"count": len(alerts_payload), "alerts": alerts_payload, "by_type": grouped})

    @app.get("/ops/runs", response_model=GenericResponse)
    def ops_runs(
        limit: int = Query(default=50, ge=1, le=500),
        conn: sqlite3.Connection = Depends(get_conn),
    ) -> GenericResponse:
        runs = fetch_recent_runs(conn, limit=limit)
        return GenericResponse(result={"count": len(runs), "runs": runs})

    @app.get("/ops/metrics", response_model=GenericResponse)
    def ops_metrics(conn: sqlite3.Connection = Depends(get_conn)) -> GenericResponse:
        return GenericResponse(result={"metrics": fetch_system_metrics(conn)})

    return app
