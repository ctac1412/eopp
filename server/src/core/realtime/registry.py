"""In-memory realtime connection and operator registry.

The registry is the only source of truth for hot-path realtime fanout. Routes
may refresh topology here when operators connect, disconnect, link, unlink, or
change display settings. Captcha fanout should then use snapshots from this
registry instead of doing repository lookups for every captcha event.
"""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass, field

DEFAULT_QUEUE_MAXSIZE = 32


def operator_api_key_id(operator_id: int) -> int:
    """Map operator ID to the negative api_key_id namespace used by SSE."""
    return -(operator_id + 100000)


@dataclass
class RealtimeConnection:
    """One live SSE connection and its bounded outbound queue."""

    queue: asyncio.Queue
    api_key_id: int | None
    ip: str
    real_api_key_id: int | None = None
    connected_at: float = field(default_factory=time.time)
    help_for: set[int] = field(default_factory=set)
    lagging: bool = False
    dropped_messages: int = 0


class RealtimeRegistry:
    """Thread-safe in-memory registry for realtime fanout snapshots.

    The registry stores both physical SSE connections and operator topology:
    owner api key -> operator IDs, operator ID -> owner api keys, and operator
    display settings. Fanout callers receive shallow snapshots so queue writes
    can happen outside the registry lock.
    """

    def __init__(self, queue_maxsize: int = DEFAULT_QUEUE_MAXSIZE) -> None:
        """Initialize an empty registry with bounded per-client queue size."""

        self.queue_maxsize = queue_maxsize
        self._lock = threading.Lock()
        self._connections_by_key: dict[int | None, list[RealtimeConnection]] = {}
        self._connections_by_queue: dict[int, RealtimeConnection] = {}
        self._master_operators: dict[int, set[int]] = {}
        self._operator_masters: dict[int, set[int]] = {}
        self._operator_display_modes: dict[int, str] = {}
        self._super_kiosk_subscriptions: dict[int, set[int]] = {}

    @property
    def lock(self) -> threading.Lock:
        """Return the registry lock for legacy pending-state compatibility."""

        return self._lock

    @property
    def super_kiosk_subscriptions(self) -> dict[int, set[int]]:
        """Return the mutable super-kiosk subscription map used by /solve."""

        return self._super_kiosk_subscriptions

    def register_connection(
        self,
        api_key_id: int | None,
        ip: str,
        real_api_key_id: int | None = None,
        help_for: set[int] | None = None,
    ) -> RealtimeConnection:
        """Register a new bounded SSE queue and return its connection record."""

        queue: asyncio.Queue = asyncio.Queue(maxsize=self.queue_maxsize)
        conn = RealtimeConnection(
            queue=queue,
            api_key_id=api_key_id,
            real_api_key_id=real_api_key_id,
            ip=ip,
            help_for=set(help_for or set()),
        )
        with self._lock:
            self._connections_by_key.setdefault(api_key_id, []).append(conn)
            self._connections_by_queue[id(queue)] = conn
            if api_key_id == -1 and real_api_key_id is not None:
                self._super_kiosk_subscriptions[real_api_key_id] = set(conn.help_for)
        return conn

    def unregister_connection(self, queue: asyncio.Queue, api_key_id: int | None = None) -> RealtimeConnection | None:
        """Remove a queue from all indexes and return the removed connection."""

        with self._lock:
            conn = self._connections_by_queue.pop(id(queue), None)
            key = conn.api_key_id if conn is not None else api_key_id
            if key in self._connections_by_key:
                self._connections_by_key[key] = [
                    existing for existing in self._connections_by_key[key] if existing.queue is not queue
                ]
                if not self._connections_by_key[key]:
                    self._connections_by_key.pop(key, None)
            if conn and conn.real_api_key_id is not None:
                self._super_kiosk_subscriptions.pop(conn.real_api_key_id, None)
            return conn

    def replace_connections(
        self,
        api_key_id: int | None,
        keep_queue: asyncio.Queue,
        ip: str,
        real_api_key_id: int | None = None,
    ) -> list[asyncio.Queue]:
        """Keep one queue for a target and return displaced queues.

        This supports force-takeover behavior for regular master/operator SSE
        streams while preserving the same registry indexes used by fanout.
        """

        with self._lock:
            current = list(self._connections_by_key.get(api_key_id, []))
            old = [conn for conn in current if conn.queue is not keep_queue]
            kept = next((conn for conn in current if conn.queue is keep_queue), None)
            if kept is None:
                kept = RealtimeConnection(
                    queue=keep_queue,
                    api_key_id=api_key_id,
                    real_api_key_id=real_api_key_id,
                    ip=ip,
                )
            kept.ip = ip
            kept.real_api_key_id = real_api_key_id
            self._connections_by_key[api_key_id] = [kept]
            self._connections_by_queue[id(keep_queue)] = kept
            for conn in old:
                self._connections_by_queue.pop(id(conn.queue), None)
            return [conn.queue for conn in old]

    def has_connection(self, api_key_id: int | None) -> bool:
        """Return whether a target currently has at least one live queue."""

        with self._lock:
            return bool(self._connections_by_key.get(api_key_id))

    def snapshot(self, api_key_id: int | None = None) -> list[RealtimeConnection]:
        """Return a shallow snapshot for one target or all connections."""

        with self._lock:
            if api_key_id is None:
                return [
                    conn
                    for conns in self._connections_by_key.values()
                    for conn in conns
                ]
            return list(self._connections_by_key.get(api_key_id, []))

    def snapshot_for_target(self, api_key_id: int | None) -> list[RealtimeConnection]:
        """Return the fanout snapshot for a target, including super kiosks."""

        with self._lock:
            if api_key_id is None:
                return [
                    conn
                    for conns in self._connections_by_key.values()
                    for conn in conns
                ]

            result = list(self._connections_by_key.get(api_key_id, []))
            if api_key_id != -1:
                for conn in self._connections_by_key.get(-1, []):
                    if not conn.help_for or api_key_id in conn.help_for:
                        result.append(conn)
            return result

    def snapshot_for_owner_and_operators(self, owner_api_key_id: int) -> list[RealtimeConnection]:
        """Return owner and subscribed-operator connections without DB access."""

        operator_ids = self.get_master_operators(owner_api_key_id)
        targets = [owner_api_key_id, *(operator_api_key_id(op_id) for op_id in operator_ids)]
        seen: set[int] = set()
        result: list[RealtimeConnection] = []
        with self._lock:
            for target in targets:
                for conn in self._connections_by_key.get(target, []):
                    qid = id(conn.queue)
                    if qid not in seen:
                        seen.add(qid)
                        result.append(conn)
        return result

    def mark_lagging(self, queue: asyncio.Queue) -> None:
        """Record a dropped message for a filled client queue."""

        with self._lock:
            conn = self._connections_by_queue.get(id(queue))
            if conn:
                conn.lagging = True
                conn.dropped_messages += 1

    def set_master_operators(self, master_key_id: int, operator_ids: list[int]) -> None:
        """Replace the operator snapshot for one master api key."""

        with self._lock:
            old = self._master_operators.get(master_key_id, set())
            new = set(operator_ids)
            self._master_operators[master_key_id] = new
            for op_id in old - new:
                masters = self._operator_masters.get(op_id)
                if masters:
                    masters.discard(master_key_id)
            for op_id in new:
                self._operator_masters.setdefault(op_id, set()).add(master_key_id)

    def set_operator_masters(self, operator_id: int, master_key_ids: list[int]) -> None:
        """Replace the master snapshot for one operator."""

        with self._lock:
            old = self._operator_masters.get(operator_id, set())
            new = set(master_key_ids)
            self._operator_masters[operator_id] = new
            for master_id in old - new:
                operators = self._master_operators.get(master_id)
                if operators:
                    operators.discard(operator_id)
            for master_id in new:
                self._master_operators.setdefault(master_id, set()).add(operator_id)

    def unlink_operator(self, operator_id: int, master_key_id: int) -> None:
        """Remove one operator/master relation from the registry."""

        with self._lock:
            self._master_operators.get(master_key_id, set()).discard(operator_id)
            self._operator_masters.get(operator_id, set()).discard(master_key_id)

    def get_master_operators(self, master_key_id: int) -> list[int]:
        """Return sorted operator IDs currently known for a master."""

        with self._lock:
            return sorted(self._master_operators.get(master_key_id, set()))

    def get_operator_masters(self, operator_id: int) -> list[int]:
        """Return sorted master api key IDs currently known for an operator."""

        with self._lock:
            return sorted(self._operator_masters.get(operator_id, set()))

    def set_operator_display_mode(self, operator_id: int, mode: str) -> None:
        """Cache the operator's icon display mode for captcha distribution."""

        with self._lock:
            self._operator_display_modes[operator_id] = mode

    def get_operator_display_modes(self, operator_ids: list[int]) -> dict[int, str]:
        """Return cached display modes, defaulting to own_then_foreign."""

        with self._lock:
            return {
                operator_id: self._operator_display_modes.get(operator_id, "own_then_foreign")
                for operator_id in operator_ids
            }

    def as_legacy_queues(self) -> dict[int | None, list[asyncio.Queue]]:
        """Build a compatibility view for older code reading sse_queues."""

        with self._lock:
            return {
                api_key_id: [conn.queue for conn in conns]
                for api_key_id, conns in self._connections_by_key.items()
            }

    def connection_infos(self) -> list[dict]:
        """Return connection metadata for admin/status views."""

        with self._lock:
            return [
                {
                    "queue": conn.queue,
                    "api_key_id": conn.api_key_id,
                    "real_api_key_id": conn.real_api_key_id,
                    "ip": conn.ip,
                    "connected_at": conn.connected_at,
                    "lagging": conn.lagging,
                    "dropped_messages": conn.dropped_messages,
                }
                for conns in self._connections_by_key.values()
                for conn in conns
            ]

    def reset(self) -> None:
        """Clear all registry state.

        This is intended for tests and process-local reinitialization only.
        """

        with self._lock:
            self._connections_by_key.clear()
            self._connections_by_queue.clear()
            self._master_operators.clear()
            self._operator_masters.clear()
            self._operator_display_modes.clear()
            self._super_kiosk_subscriptions.clear()
