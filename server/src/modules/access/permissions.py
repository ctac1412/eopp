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
    "administrator": frozenset(
        {
            Permission.CAPTCHA_SOLVE_ANY,
            Permission.OPERATOR_ANSWER,
            Permission.OPERATOR_MANAGE,
            Permission.BILLING_VIEW,
            Permission.BILLING_EDIT,
            Permission.TARIFF_EDIT,
            Permission.INVOICE_GENERATE,
            Permission.ADMIN_USERS_MANAGE,
            Permission.AUDIT_VIEW,
        }
    ),
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

ROLE_LABELS: dict[str, str] = {
    "super_admin": "Супер админ",
    "administrator": "Администратор",
    "manager": "Менеджер",
    "operator": "Оператор",
}

ROLE_SECTIONS: dict[str, tuple[str, ...]] = {
    "super_admin": (
        "reports",
        "keys",
        "companies",
        "operations",
        "operators",
        "channels",
        "captchas",
        "ai",
        "invoices",
        "prepaid",
        "expenses",
        "payouts",
        "users",
        "testbench",
        "training",
        "streams",
        "backend-logs",
    ),
    "administrator": (
        "reports",
        "keys",
        "companies",
        "operations",
        "operators",
        "channels",
        "captchas",
        "ai",
        "invoices",
        "prepaid",
        "expenses",
        "payouts",
        "users",
        "testbench",
        "training",
        "streams",
        "backend-logs",
    ),
    "manager": ("reports", "companies", "channels", "captchas", "invoices", "prepaid", "expenses", "payouts"),
    "operator": ("operations", "operators", "streams"),
}


def role_permissions(role: str | None) -> frozenset[Permission]:
    """Return permissions granted to a role, defaulting to no grants."""
    if not role:
        return frozenset()
    return ROLE_PERMISSIONS.get(role, frozenset())


def role_sections(role: str | None) -> tuple[str, ...]:
    """Return admin UI section ids visible for one role."""
    if not role:
        return ()
    return ROLE_SECTIONS.get(role, ())


def serialize_roles() -> list[dict]:
    """Return role metadata for admin UI role assignment and tab filtering."""
    return [
        {
            "id": role,
            "label": ROLE_LABELS[role],
            "permissions": sorted(permission.value for permission in permissions),
            "sections": list(role_sections(role)),
        }
        for role, permissions in ROLE_PERMISSIONS.items()
    ]
