"""Declarative HTTP access policy backed by Phase 5 RBAC permissions.

Routes should not contain scattered role checks. This module maps HTTP
method/path pairs to one permission, then delegates the decision to
``AccessService`` while keeping the legacy helper names used by older services.
"""

from dataclasses import dataclass
from typing import Literal

from src.core.contracts.permissions import AccessDecision
from src.modules.access.permissions import Permission
from src.modules.access.service import AccessService

MatchKind = Literal["exact", "prefix"]


@dataclass(frozen=True)
class AccessRule:
    method: str
    path: str
    permission: Permission | None
    match: MatchKind = "exact"

    def matches(self, method: str, path: str) -> bool:
        method_matches = self.method == "*" or self.method == method.upper()
        if not method_matches:
            return False
        if self.match == "exact":
            return path == self.path
        return path.startswith(self.path)


PUBLIC_RULES = (
    AccessRule("POST", "/admin/auth", None),
    AccessRule("GET", "/api-keys/public", None),
)

PERMISSION_RULES = (
    AccessRule("GET", "/api-keys", Permission.BILLING_VIEW),
    AccessRule("POST", "/api-keys", Permission.ADMIN_USERS_MANAGE),
    AccessRule("PUT", "/api-keys", Permission.ADMIN_USERS_MANAGE, match="prefix"),
    AccessRule("DELETE", "/api-keys", Permission.ADMIN_USERS_MANAGE, match="prefix"),
    AccessRule("POST", "/api-keys", Permission.ADMIN_USERS_MANAGE, match="prefix"),
    AccessRule("*", "/admin/api-keys", Permission.ADMIN_USERS_MANAGE, match="prefix"),
    AccessRule("GET", "/admin/audit", Permission.AUDIT_VIEW, match="prefix"),
    AccessRule("*", "/admin/operators", Permission.OPERATOR_MANAGE, match="prefix"),
    AccessRule("*", "/admin/operator-links", Permission.OPERATOR_MANAGE, match="prefix"),
    AccessRule("*", "/admin/distribution-answers", Permission.OPERATOR_MANAGE, match="prefix"),
    AccessRule("GET", "/admin/tariffs", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("PUT", "/admin/tariffs", Permission.TARIFF_EDIT, match="prefix"),
    AccessRule("DELETE", "/admin/tariffs", Permission.TARIFF_EDIT, match="prefix"),
    AccessRule("POST", "/admin/generate-invoice", Permission.INVOICE_GENERATE),
    AccessRule("GET", "/admin/invoices", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("*", "/admin/invoices", Permission.BILLING_EDIT, match="prefix"),
    AccessRule("GET", "/admin/open-invoices", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("*", "/admin/open-invoices", Permission.BILLING_EDIT, match="prefix"),
    AccessRule("*", "/admin/auto-invoices", Permission.BILLING_EDIT, match="prefix"),
    AccessRule("GET", "/admin/company", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("*", "/admin/company", Permission.BILLING_EDIT, match="prefix"),
    AccessRule("GET", "/admin/expenses", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("*", "/admin/expenses", Permission.BILLING_EDIT, match="prefix"),
    AccessRule("GET", "/admin/payouts", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("*", "/admin/payouts", Permission.BILLING_EDIT, match="prefix"),
    AccessRule("*", "/admin/users", Permission.ADMIN_USERS_MANAGE, match="prefix"),
    AccessRule("GET", "/admin/prepaid", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("*", "/admin/prepaid", Permission.BILLING_EDIT, match="prefix"),
    AccessRule("GET", "/admin/", Permission.BILLING_VIEW, match="prefix"),
    AccessRule("*", "/admin/", Permission.BILLING_EDIT, match="prefix"),
)

_access_service = AccessService()


def required_permission(method: str, path: str) -> Permission | None:
    """Return the permission required by a request, or ``None`` for public."""
    if any(rule.matches(method, path) for rule in PUBLIC_RULES):
        return None
    for rule in PERMISSION_RULES:
        if rule.matches(method, path):
            return rule.permission
    return None


def authorize_request(method: str, path: str, token: str | None) -> AccessDecision:
    """Authorize one HTTP request against the centralized RBAC matrix."""
    permission = required_permission(method, path)
    if permission is None:
        return AccessDecision(allowed=True, permission="public")
    return _access_service.authorize_token(token, permission)


def is_admin_token(token: str | None) -> bool:
    return _access_service.authenticate_token(token) is not None


def is_super_admin_token(token: str | None) -> bool:
    actor = _access_service.authenticate_token(token)
    return bool(actor and actor.role == "super_admin")


def get_token_role(token: str | None) -> str | None:
    actor = _access_service.authenticate_token(token)
    return actor.role if actor else None


def requires_admin(method: str, path: str) -> bool:
    return required_permission(method, path) is not None


def requires_super_admin(method: str, path: str) -> bool:
    """Return whether the route requires the all-powerful legacy role."""
    permission = required_permission(method, path)
    return permission in {
        Permission.ADMIN_USERS_MANAGE,
        Permission.TARIFF_EDIT,
        Permission.BILLING_EDIT,
        Permission.INVOICE_GENERATE,
        Permission.OPERATOR_MANAGE,
    }
