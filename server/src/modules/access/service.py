"""Local RBAC service for password-session based authorization."""

from __future__ import annotations

from dataclasses import dataclass

from src.core.contracts.permissions import AccessDecision
from src.modules.access.permissions import Permission, role_permissions
from src.repositories import user_repo


@dataclass(frozen=True)
class AccessActor:
    """Authenticated actor derived from a password session."""

    id: int
    token: str
    label: str
    role: str
    is_admin: bool
    source: str = "user_session"
    company_id: int | None = None


class AccessService:
    """Resolve password-session actors and make centralized RBAC decisions."""

    def authenticate_token(self, token: str | None) -> AccessActor | None:
        """Return an actor for an active password session."""
        if not token:
            return None
        user = user_repo.get_session_user(token)
        if user:
            return AccessActor(
                id=user.id,
                token=token,
                label=user.name,
                role=user.role,
                is_admin=True,
                source="user_session",
                company_id=user.company_id,
            )
        return None

    def authorize_token(self, token: str | None, permission: Permission | str) -> AccessDecision:
        """Authorize a password session token for one permission."""
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
