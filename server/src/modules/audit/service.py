"""Audit service for security, admin, and business actions."""

from __future__ import annotations

import logging
from typing import Any

from src.core.contracts.permissions import AccessDecision
from src.modules.audit.repository import AuditRepository

logger = logging.getLogger("eopp.audit")


class AuditService:
    """High-level audit writer with sync security and best-effort business modes."""

    def __init__(self, repository: AuditRepository | None = None) -> None:
        """Create an audit service backed by ``AuditRepository`` by default."""
        self.repository = repository or AuditRepository()

    def record_security(
        self,
        action: str,
        *,
        decision: AccessDecision | None = None,
        target_type: str = "security",
        target_id: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        """Synchronously record security-sensitive access and role events."""
        return self.repository.append_event(
            action=action,
            category="security",
            actor_id=decision.actor_id if decision else None,
            actor_role=decision.role if decision else None,
            permission=decision.permission if decision else None,
            target_type=target_type,
            target_id=target_id,
            metadata=metadata,
        )

    def record_admin_action(
        self,
        action: str,
        *,
        decision: AccessDecision,
        target_type: str,
        target_id: int | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        """Synchronously record an admin mutation such as role/API-key changes."""
        return self.repository.append_event(
            action=action,
            category="admin",
            actor_id=decision.actor_id,
            actor_role=decision.role,
            permission=decision.permission,
            target_type=target_type,
            target_id=target_id,
            old_value=old_value,
            new_value=new_value,
            metadata=metadata,
        )

    def enqueue_business_action(
        self,
        action: str,
        *,
        decision: AccessDecision,
        target_type: str,
        target_id: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Best-effort durable outbox audit for non-security business actions."""
        try:
            from src.platform.outbox.publisher import publish_event

            publish_event(
                "audit.business",
                {
                    "action": action,
                    "actor_id": decision.actor_id,
                    "actor_role": decision.role,
                    "permission": decision.permission,
                    "target_type": target_type,
                    "target_id": target_id,
                    "metadata": metadata or {},
                },
            )
        except Exception as exc:
            logger.warning("business audit enqueue failed action=%s error=%s", action, exc)
