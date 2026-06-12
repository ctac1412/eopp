"""Data transfer objects for durable outbox rows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class OutboxEvent:
    """Immutable view of a row in the ``outbox_events`` table."""

    id: int
    event_type: str
    payload: dict[str, Any]
    status: str
    attempts: int
    created_at: str
