"""Nonblocking fanout over realtime connection snapshots.

The fanout layer receives an already-built snapshot from RealtimeRegistry and
only performs bounded queue writes. It must never query the database, await a
client, or remove a connection just because that client's queue is full.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass

from src.platform.observability.metrics import counter_inc, gauge_set, histogram_observe

from .registry import RealtimeConnection, RealtimeRegistry

logger = logging.getLogger("eopp.realtime")


@dataclass(frozen=True)
class FanoutResult:
    """Delivery counters for one fanout operation."""

    delivered: int
    dropped: int
    lagging: int
    targeted: int


class RealtimeFanout:
    """Write SSE events to bounded per-client queues without blocking."""

    def __init__(self, registry: RealtimeRegistry) -> None:
        """Create a fanout helper backed by a RealtimeRegistry."""

        self.registry = registry

    def push(self, msg: dict, api_key_id: int | None = None) -> FanoutResult:
        """Push an event to one SSE target or broadcast to all connections.

        The target snapshot includes matching super-kiosk subscriptions. Queue
        writes use put_nowait; a filled queue increments lagging/drop counters
        and does not affect other clients.
        """

        return self._push_to_snapshot(msg, self.registry.snapshot_for_target(api_key_id), api_key_id)

    def push_to_owner_and_operators(self, msg: dict, owner_api_key_id: int) -> FanoutResult:
        """Push an event to a captcha owner and its operator snapshot."""

        return self._push_to_snapshot(
            msg,
            self.registry.snapshot_for_owner_and_operators(owner_api_key_id),
            owner_api_key_id,
        )

    def _push_to_snapshot(
        self,
        msg: dict,
        snapshot: list[RealtimeConnection],
        api_key_id: int | None,
    ) -> FanoutResult:
        """Write one event to a precomputed connection snapshot."""

        start = time.perf_counter()
        data = f"data: {json.dumps(msg)}\n\n"
        delivered = 0
        dropped = 0
        for conn in snapshot:
            try:
                conn.queue.put_nowait(data)
                delivered += 1
            except Exception:
                dropped += 1
                self.registry.mark_lagging(conn.queue)

        lagging = sum(1 for conn in snapshot if conn.lagging)
        max_depth = max((conn.queue.qsize() for conn in snapshot), default=0)
        event_type = msg.get("type") if isinstance(msg, dict) else None
        captcha_id = msg.get("captcha_id") if isinstance(msg, dict) else None
        gauge_set("realtime_queue_depth", max_depth, target=str(api_key_id) if api_key_id is not None else "broadcast")
        if dropped:
            counter_inc("realtime_dropped_messages_total", dropped)
            counter_inc("realtime_dropped_messages_total", dropped, target=str(api_key_id) if api_key_id is not None else "broadcast")
        if event_type == "new_captcha":
            display_ms = (time.perf_counter() - start) * 1000
            histogram_observe("captcha_display_latency_ms", display_ms)
            histogram_observe(
                "captcha_display_latency_ms",
                display_ms,
                source="realtime",
            )
        logger.info(
            "realtime_push event=%s captcha=%s target_api_key_id=%s delivered=%s dropped=%s lagging=%s targeted=%s",
            event_type or "-",
            captcha_id or "-",
            api_key_id if api_key_id is not None else "broadcast",
            delivered,
            dropped,
            lagging,
            len(snapshot),
        )
        return FanoutResult(
            delivered=delivered,
            dropped=dropped,
            lagging=lagging,
            targeted=len(snapshot),
        )
