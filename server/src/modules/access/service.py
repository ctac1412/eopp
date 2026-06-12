"""Local RBAC service for legacy admin/API-key compatible authorization."""

from __future__ import annotations

from dataclasses import dataclass

from src.core.contracts.permissions import AccessDecision
from src.modules.access.permissions import Permission, role_permissions
from src.repositories import api_key_repo


@dataclass(frozen=True)
class AccessActor:
    """Authenticated actor derived from an existing API key row."""

    id: int
    token: str
    label: str
    role: str
    is_admin: bool


class AccessService:
    """Resolve API-key actors and make centralized RBAC decisions.

    The service deliberately keeps the current compatibility model: existing
    active API keys with ``is_admin`` can still authenticate through
    ``X-Admin-Token``. If an admin row has no explicit ``admin_role`` yet, it is
    treated as ``super_admin`` because earlier releases allowed every admin key
    to perform all admin mutations.
    """

    def authenticate_token(self, token: str | None) -> AccessActor | None:
        """Return an actor for an active admin token, or ``None``."""
        if not token:
            return None
        record = api_key_repo.get_key_record(token)
        if not record or not record.active or not record.is_admin:
            return None
        role = record.admin_role or "super_admin"
        return AccessActor(
            id=record.id,
            token=record.key,
            label=record.label,
            role=role,
            is_admin=bool(record.is_admin),
        )

    def authorize_token(self, token: str | None, permission: Permission | str) -> AccessDecision:
        """Authorize a legacy admin token for one permission."""
        permission_value = str(permission)
        actor = self.authenticate_token(token)
        if actor is None:
            return AccessDecision(
                allowed=False,
                permission=permission_value,
                reason="unauthenticated",
            )

        try:
            permission_enum = Permission(permission_value)
        except ValueError:
            return AccessDecision(
                allowed=False,
                permission=permission_value,
                actor_id=actor.id,
                role=actor.role,
                reason="unknown_permission",
            )

        allowed = permission_enum in role_permissions(actor.role)
        return AccessDecision(
            allowed=allowed,
            permission=permission_value,
            actor_id=actor.id,
            role=actor.role,
            reason="" if allowed else "permission_denied",
        )

    def authorize(self, actor_token: str | None, permission: str) -> AccessDecision:
        """Implement the core-safe AccessChecker protocol."""
        return self.authorize_token(actor_token, permission)
