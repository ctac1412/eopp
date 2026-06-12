"""Durable outbox event publisher.

Outbox events are audit/integration records for side effects such as job
enqueued, retried, completed, or dead-lettered. They are intentionally simple
SQLite rows so they survive process restarts.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import UTC, datetime
from typing import Any

from src.db.connection import get_connection

from .models import OutboxEvent

logger = logging.getLogger("eopp.outbox")


def _now() -> str:
    """Return current UTC timestamp in the storage format used by outbox rows."""
    return datetime.now(UTC).isoformat()


def publish_event(
    event_type: str,
    payload: dict[str, Any] | None = None,
    *,
    idempotency_key: str | None = None,
    status: str = "pending",
) -> OutboxEvent:
    """Insert an outbox event, returning an existing event on idempotent retry."""

    payload_json = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True)
    now = _now()
    conn = get_connection()
    try:
        try:
            cursor = conn.execute(
                """
                INSERT INTO outbox_events (
                    event_type, payload_json, idempotency_key, status, attempts,
                    next_retry_at, last_error, created_at, updated_at, published_at
                )
                VALUES (?, ?, ?, ?, 0, NULL, NULL, ?, ?, NULL)
                """,
                (event_type, payload_json, idempotency_key, status, now, now),
            )
            conn.commit()
            event_id = int(cursor.lastrowid)
        except sqlite3.IntegrityError:
            if not idempotency_key:
                raise
            row = conn.execute(
                "SELECT id FROM outbox_events WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if row is None:
                raise
            event_id = int(row["id"])
        row = conn.execute("SELECT * FROM outbox_events WHERE id = ?", (event_id,)).fetchone()
        return _row_to_event(row)
    finally:
        conn.close()


def mark_event_published(event_id: int) -> None:
    """Mark an outbox event as published by an external dispatcher."""

    now = _now()
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE outbox_events
            SET status = 'published', published_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (now, now, event_id),
        )
        conn.commit()
    finally:
        conn.close()


def mark_event_failed(event_id: int, error: str, *, next_retry_at: str | None = None) -> None:
    """Record a dispatch failure and schedule the event for retry."""

    now = _now()
    conn = get_connection()
    try:
        conn.execute(
            """
            UPDATE outbox_events
            SET status = 'pending',
                attempts = attempts + 1,
                next_retry_at = ?,
                last_error = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (next_retry_at, error[:2000], now, event_id),
        )
        conn.commit()
    finally:
        conn.close()


def queued_events() -> list[OutboxEvent]:
    """Return outbox events in insertion order for diagnostics and tests."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM outbox_events ORDER BY id").fetchall()
        return [_row_to_event(row) for row in rows]
    finally:
        conn.close()


def _row_to_event(row) -> OutboxEvent:
    """Convert a sqlite row from outbox_events into an OutboxEvent DTO."""
    return OutboxEvent(
        id=int(row["id"]),
        event_type=row["event_type"],
        payload=json.loads(row["payload_json"] or "{}"),
        status=row["status"],
        attempts=int(row["attempts"] or 0),
        created_at=row["created_at"],
    )
