"""SSE global state and operations."""

import asyncio
import logging
import time
from datetime import UTC, datetime

from src.core.realtime import RealtimeFanout, RealtimeRegistry

logger = logging.getLogger("eopp.sse")

pending = {}
registry = RealtimeRegistry()
fanout = RealtimeFanout(registry)
lock = registry.lock
sse_queues: dict[int | None, list[asyncio.Queue]] = {}
sse_connections: list[dict] = []
super_kiosk_subscriptions: dict[int, set[int]] = registry.super_kiosk_subscriptions
queue_subscriptions: dict[int, set[int]] = {}


def _sync_legacy_state() -> None:
    """Refresh legacy module globals from RealtimeRegistry.

    Older routes still read sse_queues/sse_connections directly. New code
    should use registry snapshots, but this compatibility view keeps adjacent
    phases working while realtime is migrated.
    """

    sse_queues.clear()
    sse_queues.update(registry.as_legacy_queues())
    sse_connections[:] = registry.connection_infos()
    queue_subscriptions.clear()
    for conn in registry.snapshot():
        if conn.api_key_id == -1:
            queue_subscriptions[id(conn.queue)] = set(conn.help_for)


def push_sse(msg, api_key_id=None):
    """Push one SSE message through the nonblocking realtime fanout."""

    return fanout.push(msg, api_key_id=api_key_id)


def push_sse_owner_and_operators(msg, owner_api_key_id: int):
    """Push one SSE message to an owner and cached operator subscribers."""

    return fanout.push_to_owner_and_operators(msg, owner_api_key_id=owner_api_key_id)


def operator_api_key_id(operator_id: int) -> int:
    """Map operator ID to a negative api_key_id namespace."""
    return -(operator_id + 100000)


def register_sse_connection(
    api_key_id: int | None,
    ip: str,
    real_api_key_id: int | None = None,
    help_for: set[int] | None = None,
) -> tuple[asyncio.Queue, bool]:
    displaced = api_key_id != -1 and registry.has_connection(api_key_id)
    conn = registry.register_connection(
        api_key_id,
        ip,
        real_api_key_id=real_api_key_id,
        help_for=help_for,
    )
    _sync_legacy_state()
    logger.info(
        "sse_register api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s displaced=%s help_for=%s",
        api_key_id,
        real_api_key_id,
        ip,
        id(conn.queue),
        displaced,
        ",".join(str(x) for x in sorted(help_for or [])) if help_for is not None else "-",
    )
    return conn.queue, displaced


def replace_sse_connections(
    api_key_id: int | None,
    keep_queue: asyncio.Queue,
    ip: str,
    real_api_key_id: int | None = None,
) -> list[asyncio.Queue]:
    """Replace active connections for a target and return displaced queues."""

    old = registry.replace_connections(api_key_id, keep_queue, ip, real_api_key_id)
    _sync_legacy_state()
    return old


def unregister_sse_connection(q: asyncio.Queue, api_key_id: int | None):
    conn = registry.unregister_connection(q, api_key_id)
    _sync_legacy_state()
    logger.info(
        "sse_unregister api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s connected_for_ms=%.1f",
        api_key_id,
        conn.real_api_key_id if conn else None,
        conn.ip if conn else "-",
        id(q),
        (time.time() - conn.connected_at) * 1000 if conn else 0.0,
    )


def get_connected_streams() -> list[dict]:
    from src.repositories import api_key_repo

    snapshot = registry.connection_infos()

    result = []
    for c in snapshot:
        key_info = api_key_repo.get_key_by_id(c["api_key_id"]) if c["api_key_id"] else None
        result.append(
            {
                "api_key_id": c["api_key_id"],
                "api_key_label": key_info.label if key_info else None,
                "ip": c["ip"],
                "connected_at": c["connected_at"],
                "connected_at_iso": (
                    datetime.fromtimestamp(c["connected_at"], tz=UTC).isoformat()
                    if c["connected_at"]
                    else None
                ),
            }
        )
    return result


def set_master_operators(master_key_id: int, operator_ids: list[int]) -> None:
    """Update cached operators for a master outside captcha fanout."""

    registry.set_master_operators(master_key_id, operator_ids)


def set_operator_masters(operator_id: int, master_key_ids: list[int]) -> None:
    """Update cached masters for an operator outside captcha fanout."""

    registry.set_operator_masters(operator_id, master_key_ids)


def unlink_operator_from_master(operator_id: int, master_key_id: int) -> None:
    """Remove one cached operator/master relation."""

    registry.unlink_operator(operator_id, master_key_id)


def get_master_operators(master_key_id: int) -> list[int]:
    """Return cached operators for captcha distribution setup."""

    return registry.get_master_operators(master_key_id)


def get_operator_masters(operator_id: int) -> list[int]:
    """Return cached masters for an operator stream."""

    return registry.get_operator_masters(operator_id)


def set_operator_display_mode(operator_id: int, mode: str) -> None:
    """Cache an operator display mode for distribution without hot-path DB reads."""

    registry.set_operator_display_mode(operator_id, mode)


def get_operator_display_modes(operator_ids: list[int]) -> dict[int, str]:
    """Return cached operator display modes for captcha distribution."""

    return registry.get_operator_display_modes(operator_ids)
