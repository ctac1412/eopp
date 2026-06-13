"""DTOs for operator distribution.

This module is intentionally free of FastAPI and database imports so future
distribution builders can preview and test plans without applying assignments.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class DistributionMaster:
    """Master candidate visible to distribution strategies."""

    id: int
    label: str
    online: bool
    active: bool = True


@dataclass(frozen=True)
class DistributionOperator:
    """Operator candidate visible to distribution strategies."""

    id: int
    nickname: str
    online: bool
    allowed_master_ids: list[int] | None = None


@dataclass(frozen=True)
class DistributionAssignment:
    """One planned operator-to-master assignment."""

    operator_id: int
    master_key_id: int


@dataclass(frozen=True)
class DistributionSkippedOperator:
    """Operator omitted from a plan with a stable reason code."""

    operator_id: int
    reason: str


@dataclass(frozen=True)
class DistributionPlan:
    """Pure assignment plan produced before repository writes."""

    strategy: str
    assignments: list[DistributionAssignment] = field(default_factory=list)
    skipped: list[DistributionSkippedOperator] = field(default_factory=list)
