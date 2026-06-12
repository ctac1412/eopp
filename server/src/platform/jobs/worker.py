"""Synchronous worker loop for durable background jobs.

The implementation intentionally has no HTTP dependencies. A process manager,
CLI command, or test can call ``run_due_jobs`` to drain due jobs. Handler
failures are isolated to the job row: they update retry/dead-letter state and
never raise back into request handlers.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from src.db.connection import get_connection
from src.platform.observability.metrics import counter_inc, gauge_set
from src.platform.outbox.publisher import publish_event

logger = logging.getLogger("eopp.jobs.worker")
JobHandler = Callable[[dict[str, Any]], Any]


@dataclass
class JobRunResult:
    """Counters collected from one worker drain pass."""

    processed: int = 0
    succeeded: int = 0
    failed: int = 0
    dead_lettered: int = 0
    missing_handler: int = 0


class JobRegistry:
    """Small in-process map from job names to handler callables."""

    def __init__(self) -> None:
        self._handlers: dict[str, JobHandler] = {}

    def register(self, job_name: str, handler: JobHandler) -> None:
        """Register or replace the handler for ``job_name``."""

        self._handlers[job_name] = handler

    def get(self, job_name: str) -> JobHandler | None:
        """Return the handler for ``job_name`` or ``None`` when disabled."""

        return self._handlers.get(job_name)


def default_registry() -> JobRegistry:
    """Build the default side-module job registry.

    Module import failures are logged and skipped so a broken side module does
    not prevent the worker process from starting.
    """

    registry = JobRegistry()
    try:
        from src.modules.captcha_archive.jobs import register_jobs as register_captcha_jobs

        register_captcha_jobs(registry)
    except Exception:
        logger.exception("failed to register captcha_archive jobs")
    try:
        from src.modules.crm.jobs import register_jobs as register_crm_jobs

        register_crm_jobs(registry)
    except Exception:
        logger.exception("failed to register crm jobs")
    try:
        from src.modules.billing.jobs import register_jobs as register_billing_jobs

        register_billing_jobs(registry)
    except Exception:
        logger.exception("failed to register billing jobs")
    try:
        from src.modules.usage.jobs import register_jobs as register_usage_jobs

        register_usage_jobs(registry)
    except Exception:
        logger.exception("failed to register usage jobs")
    return registry


def run_due_jobs(
    *,
    registry: JobRegistry | None = None,
    max_jobs: int = 50,
    max_attempts: int = 3,
    retry_delay_seconds: int = 30,
) -> JobRunResult:
    """Run due jobs once and record success, retry, or dead-letter outcomes."""

    registry = registry or default_registry()
    result = JobRunResult()
    rows = _load_due_jobs(max_jobs)
    _observe_job_lag(rows)
    for row in rows:
        result.processed += 1
        job_id = int(row["id"])
        job_name = row["job_name"]
        payload = json.loads(row["payload_json"] or "{}")
        handler = registry.get(job_name)
        if handler is None:
            result.missing_handler += 1
            result.dead_lettered += 1
            counter_inc("background_job_failures_total", job_name=job_name)
            _mark_failed(
                job_id,
                attempts=int(row["attempts"] or 0) + 1,
                error=f"No handler registered for job {job_name}",
                max_attempts=1,
                retry_delay_seconds=retry_delay_seconds,
            )
            continue

        _mark_running(job_id)
        try:
            handler(payload)
        except Exception as exc:
            attempts = int(row["attempts"] or 0) + 1
            dead = attempts >= max_attempts
            if dead:
                result.dead_lettered += 1
            else:
                result.failed += 1
            counter_inc("background_job_failures_total", job_name=job_name)
            _mark_failed(
                job_id,
                attempts=attempts,
                error=str(exc),
                max_attempts=max_attempts,
                retry_delay_seconds=retry_delay_seconds,
            )
            logger.warning("background_job failed id=%s name=%s error=%s", job_id, job_name, exc)
            continue

        result.succeeded += 1
        _mark_done(job_id)
    return result


def _observe_job_lag(rows) -> None:
    """Record the oldest due job age for local worker observability."""

    now = datetime.now(UTC)
    max_lag = 0.0
    for row in rows:
        created_at = row["created_at"]
        try:
            created = datetime.fromisoformat(created_at)
        except (TypeError, ValueError):
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        max_lag = max(max_lag, (now - created).total_seconds())
    gauge_set("background_job_lag_seconds", max_lag)


def _now() -> str:
    """Return current UTC timestamp in the storage format used by job rows."""
    return datetime.now(UTC).isoformat()


def _load_due_jobs(max_jobs: int):
    """Fetch pending jobs whose retry window allows execution now."""
    now = _now()
    conn = get_connection()
    try:
        return conn.execute(
            """
            SELECT * FROM background_jobs
            WHERE status = 'pending'
              AND (next_retry_at IS NULL OR next_retry_at <= ?)
            ORDER BY id
            LIMIT ?
            """,
            (now, max_jobs),
        ).fetchall()
    finally:
        conn.close()


def _mark_running(job_id: int) -> None:
    """Mark a job as locked by the current worker pass."""
    now = _now()
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE background_jobs SET status = 'running', locked_at = ?, updated_at = ? WHERE id = ?",
            (now, now, job_id),
        )
        conn.commit()
    finally:
        conn.close()


def _mark_done(job_id: int) -> None:
    """Mark a job complete and publish the corresponding outbox event."""
    now = _now()
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE background_jobs
            SET status = 'done', completed_at = ?, updated_at = ?, locked_at = NULL
            WHERE id = ?
            """,
            (now, now, job_id),
        )
        conn.commit()
    finally:
        conn.close()
    publish_event("job.done", {"job_id": job_id}, idempotency_key=f"job.done:{job_id}")


def _mark_failed(
    job_id: int,
    *,
    attempts: int,
    error: str,
    max_attempts: int,
    retry_delay_seconds: int,
) -> None:
    """Record failure state, scheduling retry or dead-lettering the job."""
    now_dt = datetime.now(UTC)
    now = now_dt.isoformat()
    dead = attempts >= max_attempts
    status = "dead" if dead else "pending"
    next_retry_at = None if dead else (now_dt + timedelta(seconds=retry_delay_seconds)).isoformat()
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE background_jobs
            SET status = ?,
                attempts = ?,
                next_retry_at = ?,
                last_error = ?,
                updated_at = ?,
                locked_at = NULL
            WHERE id = ?
            """,
            (status, attempts, next_retry_at, error[:2000], now, job_id),
        )
        conn.commit()
    finally:
        conn.close()
    event_type = "job.dead" if dead else "job.retry"
    publish_event(
        event_type,
        {"job_id": job_id, "attempts": attempts, "error": error[:500]},
        idempotency_key=f"{event_type}:{job_id}:{attempts}",
    )
