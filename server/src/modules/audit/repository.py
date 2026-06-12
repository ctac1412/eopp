"""SQLite repository for admin/security/business audit events."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from src.db.connection import get_connection


class AuditRepository:
    """Persist and read audit rows without exposing sqlite details to routes."""

    def append_event(
        self,
        *,
        action: str,
        category: str,
        actor_id: int | None = None,
        actor_role: str | None = None,
        permission: str | None = None,
        target_type: str = "",
        target_id: int | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        """Insert one audit event and return its row id."""
        now = datetime.now(UTC).isoformat()
        metadata_json = json.dumps(metadata or {}, ensure_ascii=False, sort_keys=True)
        conn = get_connection()
        try:
            cursor = conn.execute(
                """
                INSERT INTO admin_audit_log (
                    admin_id, action, target_type, target_id, old_value, new_value,
                    timestamp, category, actor_role, permission, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    actor_id if actor_id is not None else 0,
                    action,
                    target_type,
                    target_id,
                    old_value,
                    new_value,
                    now,
                    category,
                    actor_role,
                    permission,
                    metadata_json,
                ),
            )
            conn.commit()
            return int(cursor.lastrowid)
        finally:
            conn.close()

    def list_events(self, limit: int = 200, actor_id: int | None = None) -> list[dict]:
        """Return newest audit events, optionally scoped to one actor."""
        conn = get_connection()
        try:
            query = """SELECT a.*, k.label as admin_label
                       FROM admin_audit_log a
                       LEFT JOIN api_keys k ON a.admin_id = k.id
                       WHERE 1=1"""
            params: list[Any] = []
            if actor_id is not None:
                query += " AND a.admin_id = ?"
                params.append(actor_id)
            query += " ORDER BY a.id DESC LIMIT ?"
            params.append(limit)
            return [dict(row) for row in conn.execute(query, params).fetchall()]
        finally:
            conn.close()
