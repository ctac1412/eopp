"""Core-safe authorization contracts.

This module is intentionally limited to immutable DTOs and protocols. Protected
core code may depend on these types to ask an adapter whether an actor can do
something, but it must not import RBAC tables, repositories, FastAPI, or audit
modules.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AccessDecision:
    """Authorization result that can cross the protected-core boundary.

    ``allowed`` is the only field core needs for branching. The remaining
    fields are diagnostic context for adapters, logs, and tests, and must stay
    primitive so the contract does not leak database entities into core.
    """

    allowed: bool
    permission: str
    actor_id: int | None = None
    role: str | None = None
    reason: str = ""


class AccessChecker(Protocol):
    """Minimal interface core may use for authorization decisions."""

    def authorize(self, actor_token: str | None, permission: str) -> AccessDecision:
        """Return whether ``actor_token`` grants ``permission``."""
        ...
