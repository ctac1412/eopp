"""Admin audit log persistence."""

from datetime import UTC, datetime

from src.db.connection import get_connection


def log_audit(
    admin_id: int,
    action: str,
    target_type: str,
    target_id: int | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
) -> None:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    conn.execute(
        """INSERT INTO admin_audit_log
           (admin_id, action, target_type, target_id, old_value, new_value, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (admin_id, action, target_type, target_id, old_value, new_value, now),
    )
    conn.commit()
    conn.close()


def list_audit_log(limit: int = 200, admin_id: int | None = None) -> list[dict]:
    conn = get_connection()
    query = """SELECT a.*, k.label as admin_label
               FROM admin_audit_log a
               LEFT JOIN api_keys k ON a.admin_id = k.id
               WHERE 1=1"""
    params: list = []
    if admin_id is not None:
        query += " AND a.admin_id = ?"
        params.append(admin_id)
    query += " ORDER BY a.id DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]
