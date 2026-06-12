"""Event DTOs for finance side-work.

These DTOs document the boundary between core usage confirmation and finance
processing. Core code should enqueue durable jobs with these payload shapes
instead of importing tariff, prepaid, or invoice modules directly.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class UsageBillingRequested:
    """Payload for the first billing job in the confirmed-usage finance chain."""

    usage_log_id: int

    def to_payload(self) -> dict[str, int]:
        """Return the durable-job payload representation."""

        return {"usage_log_id": self.usage_log_id}

