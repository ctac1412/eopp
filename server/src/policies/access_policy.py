"""Declarative HTTP access policy.

Routes still own domain-specific self-access checks. This module only answers
whether a request must present an admin token before it reaches the route.

Role model:
  - super_admin: full access, can change admin_role of other keys
  - manager: read-only admin access, cannot modify admin_role
"""

from dataclasses import dataclass
from typing import Literal

from src.repositories import api_key_repo

MatchKind = Literal["exact", "prefix"]


@dataclass(frozen=True)
class AccessRule:
    method: str
    path: str
    role: str
    match: MatchKind = "exact"

    def matches(self, method: str, path: str) -> bool:
        method_matches = self.method == "*" or self.method == method.upper()
        if not method_matches:
            return False
        if self.match == "exact":
            return path == self.path
        return path.startswith(self.path)


PUBLIC_RULES = (
    AccessRule("POST", "/admin/auth", "public"),
    AccessRule("GET", "/api-keys/public", "public"),
)

ADMIN_RULES = (
    AccessRule("*", "/api-keys", "admin", match="prefix"),
    AccessRule("*", "/admin/", "admin", match="prefix"),
)

SUPER_ADMIN_RULES = (
    AccessRule("*", "/api-keys", "super_admin", match="prefix"),
)


def is_admin_token(token: str | None) -> bool:
    return bool(token and api_key_repo.check_admin_token(token))


def is_super_admin_token(token: str | None) -> bool:
    return bool(token and api_key_repo.is_super_admin_token(token))


def get_token_role(token: str | None) -> str | None:
    if not token:
        return None
    return api_key_repo.get_admin_role(token)


def requires_admin(method: str, path: str) -> bool:
    if any(rule.matches(method, path) for rule in PUBLIC_RULES):
        return False
    return any(rule.matches(method, path) for rule in ADMIN_RULES)


def requires_super_admin(method: str, path: str) -> bool:
    """Check if the path requires super_admin (e.g. changing admin_role)."""
    if not requires_admin(method, path):
        return False
    return any(rule.matches(method, path) for rule in SUPER_ADMIN_RULES)
