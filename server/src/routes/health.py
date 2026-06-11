"""Health check and metrics endpoints.

GET /health  — DB connectivity check
GET /ready   — full readiness: DB + SSE + rucaptcha (if enabled)
GET /metrics — Prometheus text format metrics
"""

import logging
import os
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse, PlainTextResponse

from src.db.connection import get_connection
from src.sse import lock as sse_lock, pending as sse_pending, sse_queues

logger = logging.getLogger("eopp.health")

router = APIRouter(tags=["health"])

_metrics: dict[str, float] = {}
METRIC_PREFIX = "eopp"


def counter_inc(name: str, value: float = 1.0):
    key = f"{METRIC_PREFIX}_{name}_total"
    _metrics[key] = _metrics.get(key, 0) + value


def gauge_set(name: str, value: float):
    _metrics[f"{METRIC_PREFIX}_{name}"] = value


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
    gauge_set("sse_connections_active", sum(len(v) for v in sse_queues.values()))
    gauge_set("pending_captchas", len(sse_pending))

    lines = []
    for key, value in sorted(_metrics.items()):
        if key.endswith("_total"):
            lines.append(f"{key} {value}")
        else:
            lines.append(f"{key} {value}")
    lines.append("")
    return PlainTextResponse("\n".join(lines), media_type="text/plain; version=0.0.4")
