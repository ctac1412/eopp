"""Durable background job enqueueing.

This module is the only supported entry point for side-work scheduling from
core request paths. It writes to SQLite synchronously, but callers in hot paths
must still treat enqueue as best-effort and catch failures.
"""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from src.db.connection import get_connection
from src.platform.outbox.publisher import publish_event

logger = logging.getLogger("eopp.jobs")


@dataclass(frozen=True)
class DeferredJob:
    """Immutable view of a row in the ``background_jobs`` table."""

    id: int
    name: str
    payload: dict[str, Any]
    queued_at: str
    idempotency_key: str
    status: str = "pending"
    attempts: int = 0


def _now() -> str:
    """Return current UTC timestamp in the storage format used by job rows."""
    return datetime.now(UTC).isoformat()


def job_idempotency_key(name: str, payload: dict[str, Any] | None = None) -> str:
    """Return the stable key used to collapse duplicate deferred jobs."""

    payload = payload or {}
    if name in {"captcha_archive", "captcha_metadata"} and payload.get("captcha_id"):
        return f"{name}:{payload['captcha_id']}"
    if name in {
        "usage_enrich",
        "crm.enrich_usage",
        "billing_confirm",
        "billing.calculate_usage_price",
        "billing.deduct_prepaid",
        "billing.link_open_invoice",
        "captcha_records",
        "telegram_confirmed_usage",
    } and payload.get("usage_log_id"):
        return f"{name}:{payload['usage_log_id']}"
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:24]
    return f"{name}:{digest}"


def enqueue_deferred_job(
    name: str,
    payload: dict[str, Any] | None = None,
    *,
    idempotency_key: str | None = None,
) -> DeferredJob:
    """Persist a background job and emit one ``job.enqueued`` outbox event.

    Duplicate jobs return the existing row when their idempotency key already
    exists. This keeps captcha and usage side-work safe to enqueue repeatedly
    from retrying HTTP clients or duplicate captcha submissions.
    """

    payload = payload or {}
    idempotency_key = idempotency_key or job_idempotency_key(name, payload)
    payload_json = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    now = _now()
    conn = get_connection()
    inserted = False
    try:
        try:
            cursor = conn.execute(
                """
                INSERT INTO background_jobs (
                    job_name, payload_json, idempotency_key, status, attempts,
                    next_retry_at, last_error, created_at, updated_at, locked_at, completed_at
                )
                VALUES (?, ?, ?, 'pending', 0, NULL, NULL, ?, ?, NULL, NULL)
                """,
                (name, payload_json, idempotency_key, now, now),
            )
            conn.commit()
            job_id = int(cursor.lastrowid)
            inserted = True
        except sqlite3.IntegrityError:
            row = conn.execute(
                "SELECT id FROM background_jobs WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if row is None:
                raise
            job_id = int(row["id"])

        if inserted:
            publish_event(
                "job.enqueued",
                {"job_id": job_id, "job_name": name, "idempotency_key": idempotency_key},
                idempotency_key=f"job.enqueued:{idempotency_key}",
            )
            logger.info("deferred_job queued name=%s id=%s", name, job_id)
        return _get_job(conn, job_id)
    finally:
        conn.close()


def queued_jobs() -> list[DeferredJob]:
    """Return all stored jobs in insertion order.

    Kept mostly for tests and diagnostics; production workers should use
    ``run_due_jobs`` so retry windows and status transitions are respected.
    """

    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM background_jobs ORDER BY id").fetchall()
        return [_row_to_job(row) for row in rows]
    finally:
        conn.close()


def clear_queued_jobs() -> None:
    """Delete all outbox events and jobs from the current database."""

    conn = get_connection()
    try:
        conn.execute("DELETE FROM outbox_events")
        conn.execute("DELETE FROM background_jobs")
        conn.commit()
    finally:
        conn.close()


def _get_job(conn, job_id: int) -> DeferredJob:
    """Load one job row from an already-open connection."""
    row = conn.execute("SELECT * FROM background_jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise LookupError(f"background job {job_id} not found")
    return _row_to_job(row)


def _row_to_job(row) -> DeferredJob:
    """Convert a sqlite row from background_jobs into a DeferredJob DTO."""
    return DeferredJob(
        id=int(row["id"]),
        name=row["job_name"],
        payload=json.loads(row["payload_json"] or "{}"),
        queued_at=row["created_at"],
        idempotency_key=row["idempotency_key"],
        status=row["status"],
        attempts=int(row["attempts"] or 0),
    )
