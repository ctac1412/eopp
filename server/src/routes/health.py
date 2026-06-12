"""Health check and metrics endpoints.

GET /health  — DB connectivity check
GET /ready   — full readiness: DB + SSE + rucaptcha (if enabled)
GET /metrics — Prometheus text format metrics
"""

import logging
import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from src.db.connection import get_connection
from src.platform.module_registry import module_health_payload
from src.platform.observability.metrics import gauge_set, render_prometheus
from src.sse import lock as sse_lock
from src.sse import pending as sse_pending
from src.sse import sse_queues

logger = logging.getLogger("eopp.health")

router = APIRouter(tags=["health"])

@router.get("/health")
async def health():
    try:
        conn = get_connection()
        conn.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception as exc:
        logger.error("health_db_check_failed %s", exc)
        db_ok = False

    status_code = 200 if db_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "ok" if db_ok else "degraded", "db": "ok" if db_ok else "error"},
    )


@router.get("/health/modules")
async def module_health(request: Request):
    """Return optional module load status without probing side-module internals."""

    return JSONResponse(content=module_health_payload(request.app))


@router.get("/ready")
async def ready():
    checks = {}

    try:
        conn = get_connection()
        conn.execute("SELECT 1")
        conn.close()
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    with sse_lock:
        total_queues = sum(len(v) for v in sse_queues.values())
    checks["sse_manager"] = "ok"

    rucaptcha_key = os.environ.get("RUCAPTCHA_API_KEY", "")
    auto_solver_enabled = os.environ.get("EOPP_AUTO_SOLVER_ENABLED", "0") != "0"
    if auto_solver_enabled:
        checks["rucaptcha"] = "ok" if rucaptcha_key else "not_configured"
    else:
        checks["rucaptcha"] = "disabled"

    all_ok = all(v == "ok" for v in checks.values() if v != "disabled")
    status_code = 200 if all_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_ok else "not_ready",
            "checks": checks,
            "sse_queues": total_queues,
        },
    )


@router.get("/metrics")
async def metrics():
    """Return process-local Phase 8 metrics in Prometheus text format."""

    gauge_set("sse_connections_active", sum(len(v) for v in sse_queues.values()))
    gauge_set("captcha_pending_count", len(sse_pending))

    return PlainTextResponse(render_prometheus(), media_type="text/plain; version=0.0.4")
