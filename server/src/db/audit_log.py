"""Backward-compatible admin audit log persistence helpers."""


def log_audit(
    admin_id: int,
    action: str,
    target_type: str,
    target_id: int | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
) -> None:
    """Write a legacy admin audit event using the Phase 5 audit repository."""
    from src.modules.audit.repository import AuditRepository

    AuditRepository().append_event(
        actor_id=admin_id,
        action=action,
        category="admin",
        target_type=target_type,
        target_id=target_id,
        old_value=old_value,
        new_value=new_value,
    )


def list_audit_log(limit: int = 200, admin_id: int | None = None) -> list[dict]:
    """Return audit rows through the legacy function name."""
    from src.modules.audit.repository import AuditRepository

    return AuditRepository().list_events(limit=limit, actor_id=admin_id)
