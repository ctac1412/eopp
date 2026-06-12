"""Core realtime primitives for bounded SSE delivery.

This package owns the in-memory connection registry and nonblocking fanout
logic used by the FastAPI SSE shell. It is intentionally small and core-safe:
it does not import repositories, routes, billing, CRM, plugins, or any other
side module.
"""

from .fanout import FanoutResult, RealtimeFanout
from .registry import RealtimeConnection, RealtimeRegistry, operator_api_key_id

__all__ = [
    "FanoutResult",
    "RealtimeConnection",
    "RealtimeFanout",
    "RealtimeRegistry",
    "operator_api_key_id",
]
