"""Admin queue management routes.

This router is an HTTP adapter for the durable ``background_jobs`` and
``outbox_events`` tables. It is intentionally outside protected core: operators
can inspect backlog, run a bounded worker drain, and enqueue known repair jobs
without coupling captcha hot paths to side modules.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.db.connection import DB_PATH, get_connection
from src.platform.jobs.queue import enqueue_deferred_job
from src.platform.jobs.worker import run_due_jobs

router = APIRouter(prefix="/admin/jobs", tags=["admin"])


class RunJobsBody(BaseModel):
    max_jobs: int = Field(default=50, ge=1, le=500)
    max_attempts: int = Field(default=3, ge=1, le=20)
    retry_delay_seconds: int = Field(default=30, ge=0, le=3600)


class RequeueUsageBody(BaseModel):
    usage_log_id: int = Field(ge=1)
    jobs: list[str] = Field(default_factory=lambda: ["crm.enrich_usage"])


ALLOWED_USAGE_REQUEUE_JOBS = {
    "crm.enrich_usage",
    "billing.calculate_usage_price",
    "captcha_records",
    "telegram_confirmed_usage",
}


def _parse_payload(raw_payload: str | None) -> dict[str, Any]:
    if not raw_payload:
        return {}
    try:
        parsed = json.loads(raw_payload)
    except json.JSONDecodeError:
        return {"_raw": raw_payload}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def _row_to_job(row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "job_name": row["job_name"],
        "status": row["status"],
        "attempts": int(row["attempts"] or 0),
        "next_retry_at": row["next_retry_at"],
        "last_error": row["last_error"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "locked_at": row["locked_at"],
        "completed_at": row["completed_at"],
        "idempotency_key": row["idempotency_key"],
        "payload": _parse_payload(row["payload_json"]),
    }


def _fetch_grouped_counts(conn, table_name: str, group_field: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        SELECT status, {group_field} AS name, COUNT(*) AS count
        FROM {table_name}
        GROUP BY status, {group_field}
        ORDER BY status, {group_field}
        """
    ).fetchall()
    return [dict(row) for row in rows]


@router.get("")
async def admin_jobs_overview(limit: int = 50, status: str | None = None, job_name: str | None = None):
    """Return queue counts plus recent jobs for the admin queue page."""

    limit = max(1, min(limit, 500))
    clauses: list[str] = []
    params: list[Any] = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if job_name:
        clauses.append("job_name = ?")
        params.append(job_name)
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)

    conn = get_connection()
    try:
        jobs = conn.execute(
            f"""
            SELECT *
            FROM background_jobs
            {where_sql}
            ORDER BY id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
        oldest_due = conn.execute(
            """
            SELECT id, job_name, created_at
            FROM background_jobs
            WHERE status = 'pending'
              AND (next_retry_at IS NULL OR next_retry_at <= ?)
            ORDER BY id
            LIMIT 1
            """,
            (datetime.now(UTC).isoformat(),),
        ).fetchone()
        content = {
            "db_path": DB_PATH,
            "jobs_by_status": _fetch_grouped_counts(conn, "background_jobs", "job_name"),
            "outbox_by_status": _fetch_grouped_counts(conn, "outbox_events", "event_type"),
            "oldest_due_job": dict(oldest_due) if oldest_due else None,
            "jobs": [_row_to_job(row) for row in jobs],
        }
    finally:
        conn.close()
    return JSONResponse(content=content)


@router.post("/run")
async def admin_run_jobs(body: RunJobsBody):
    """Run one bounded worker drain pass from the admin UI."""

    result = run_due_jobs(
        max_jobs=body.max_jobs,
        max_attempts=body.max_attempts,
        retry_delay_seconds=body.retry_delay_seconds,
    )
    return JSONResponse(
        content={
            "processed": result.processed,
            "succeeded": result.succeeded,
            "failed": result.failed,
            "dead_lettered": result.dead_lettered,
            "missing_handler": result.missing_handler,
        }
    )


@router.post("/requeue-usage")
async def admin_requeue_usage(body: RequeueUsageBody):
    """Enqueue allowed usage-scoped repair jobs for one usage_log row."""

    invalid = [job for job in body.jobs if job not in ALLOWED_USAGE_REQUEUE_JOBS]
    if invalid:
        return JSONResponse(
            status_code=400,
            content={
                "error": "unsupported_job",
                "invalid_jobs": invalid,
                "allowed_jobs": sorted(ALLOWED_USAGE_REQUEUE_JOBS),
            },
        )

    queued = [
        enqueue_deferred_job(job_name, {"usage_log_id": body.usage_log_id})
        for job_name in body.jobs
    ]
    return JSONResponse(
        content={
            "usage_log_id": body.usage_log_id,
            "jobs": [
                {
                    "id": job.id,
                    "job_name": job.name,
                    "status": job.status,
                    "attempts": job.attempts,
                    "idempotency_key": job.idempotency_key,
                }
                for job in queued
            ],
        }
    )


@router.get("/{job_id}")
async def admin_job_detail(job_id: int):
    """Return one job row with parsed payload for diagnostics."""

    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM background_jobs WHERE id = ?", (job_id,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return JSONResponse(status_code=404, content={"error": "job_not_found"})
    return JSONResponse(content=_row_to_job(row))
