"""Declarative HTTP access policy.

Routes still own domain-specific self-access checks. This module only answers
whether a request must present an admin token before it reaches the route.
"""

from dataclasses import dataclass
from typing import Literal

from src.db import check_admin_token

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


PUBLIC_RULES = (AccessRule("POST", "/admin/auth", "public"),)

ADMIN_RULES = (
    AccessRule("*", "/api-keys", "admin", match="prefix"),
    AccessRule("*", "/admin/", "admin", match="prefix"),
)


def is_admin_token(token: str | None) -> bool:
    return bool(token and check_admin_token(token))


def requires_admin(method: str, path: str) -> bool:
    if any(rule.matches(method, path) for rule in PUBLIC_RULES):
        return False
    return any(rule.matches(method, path) for rule in ADMIN_RULES)
