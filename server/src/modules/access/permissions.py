"""RBAC permission names and local role grants for server side modules."""

from __future__ import annotations

from enum import StrEnum


class Permission(StrEnum):
    """Stable permission identifiers used by HTTP adapters and audit records."""

    CAPTCHA_SOLVE_OWN = "captcha.solve.own"
    CAPTCHA_SOLVE_ANY = "captcha.solve.any"
    OPERATOR_ANSWER = "operator.answer"
    OPERATOR_MANAGE = "operator.manage"
    BILLING_VIEW = "billing.view"
    BILLING_EDIT = "billing.edit"
    TARIFF_EDIT = "tariff.edit"
    INVOICE_GENERATE = "invoice.generate"
    ADMIN_USERS_MANAGE = "admin.users.manage"
    AUDIT_VIEW = "audit.view"


ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    "super_admin": frozenset(permission for permission in Permission),
    "manager": frozenset(
        {
            Permission.CAPTCHA_SOLVE_ANY,
            Permission.OPERATOR_ANSWER,
            Permission.BILLING_VIEW,
            Permission.AUDIT_VIEW,
        }
    ),
    "operator": frozenset({Permission.OPERATOR_ANSWER}),
}


def role_permissions(role: str | None) -> frozenset[Permission]:
    """Return permissions granted to a role, defaulting to no grants."""
    if not role:
        return frozenset()
    return ROLE_PERMISSIONS.get(role, frozenset())
