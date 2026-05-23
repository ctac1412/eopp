"""In-memory coordination for shared AvailableSlots responses."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import RLock
from typing import Any


DEFAULT_WAIT_MS = 10000
MAX_WAIT_MS = 15000
GROUP_TTL_SECONDS = MAX_WAIT_MS
MASTER_TIMEOUT = 3.1


@dataclass
class SlotsGroup:
    group_key: str
    master_id: str
    created_at: float
    expires_at: float
    last_heartbeat_at: float = 0.0
    slots_response: dict[str, Any] | None = None
    error: str | None = None
    published_at: float | None = None
    waiters: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


_lock = RLock()
_groups: dict[str, SlotsGroup] = {}
_event_log: list[dict] = []
MAX_EVENT_LOG = 500



def _now() -> float:
    return time.time()


def _cleanup(now: float | None = None) -> None:
    current = now or _now()
    expired = [key for key, group in _groups.items() if group.expires_at <= current]
    for key in expired:
        del _groups[key]


def _snapshot(group: SlotsGroup, role: str, status: str) -> dict[str, Any]:
    return {
        "group_key": group.group_key,
        "role": role,
        "status": status,
        "master_id": group.master_id,
        "expires_at": group.expires_at,
        "slots_response": group.slots_response,
        "error": group.error,
        "waiters": group.waiters,
    }


def _log_event(event_type: str, group_key: str, client_id: str, details: dict[str, Any] | None = None) -> None:
    _event_log.append({
        "type": event_type,
        "group_key": group_key,
        "client_id": client_id,
        "timestamp": _now(),
        "details": details or {},
    })
    if len(_event_log) > MAX_EVENT_LOG:
        _event_log[:] = _event_log[-MAX_EVENT_LOG:]


def get_events_since(index: int) -> tuple[list[dict], int]:
    with _lock:
        current = len(_event_log)
        if index >= current:
            return [], current
        return _event_log[index:], current


def claim(group_key: str, client_id: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    current = _now()
    with _lock:
        _cleanup(current)
        group = _groups.get(group_key)
        if group is None:
            group = SlotsGroup(
                group_key=group_key,
                master_id=client_id,
                created_at=current,
                expires_at=current + GROUP_TTL_SECONDS,
                meta=meta or {},
            )
            _groups[group_key] = group
            _log_event("claim", group_key, client_id, {"role": "master", "status": "claimed", "meta": meta or {}, "ttl": int(group.expires_at - current)})
            return _snapshot(group, "master", "claimed")

        if group.slots_response is not None:
            _log_event("claim", group_key, client_id, {"role": "slave", "status": "ready"})
            return _snapshot(group, "slave", "ready")

        if group.error is not None:
            _log_event("claim", group_key, client_id, {"role": "slave", "status": "failed", "error": group.error})
            return _snapshot(group, "slave", "failed")

        if group.master_id == client_id:
            _log_event("claim", group_key, client_id, {"role": "master", "status": "claimed", "existing": True})
            return _snapshot(group, "master", "claimed")

        group.waiters += 1
        _log_event("claim", group_key, client_id, {"role": "slave", "status": "pending", "waiters": group.waiters})
        return _snapshot(group, "slave", "pending")


def publish(group_key: str, client_id: str, slots_response: dict[str, Any]) -> dict[str, Any]:
    current = _now()
    with _lock:
        _cleanup(current)
        group = _groups.get(group_key)
        if group is None:
            group = SlotsGroup(
                group_key=group_key,
                master_id=client_id,
                created_at=current,
                expires_at=current + GROUP_TTL_SECONDS,
            )
            _groups[group_key] = group

        if group.master_id != client_id:
            return {
                "ok": False,
                "error": "not_master",
                "master_id": group.master_id,
                "group_key": group_key,
            }

        group.slots_response = slots_response
        group.error = None
        group.published_at = current
        _log_event("publish", group_key, client_id, {"role": "master", "status": "ready", "slots_count": len(slots_response.get("slots", []))})
        return {"ok": True, **_snapshot(group, "master", "ready")}


def fail(group_key: str, client_id: str, error: str) -> dict[str, Any]:
    current = _now()
    with _lock:
        _cleanup(current)
        group = _groups.get(group_key)
        if group is None:
            return {"ok": True, "group_key": group_key, "status": "missing"}
        if group.master_id != client_id:
            return {
                "ok": False,
                "error": "not_master",
                "master_id": group.master_id,
                "group_key": group_key,
            }
        group.error = error
        _log_event("fail", group_key, client_id, {"role": "master", "status": "failed", "error": error})
        return {"ok": True, **_snapshot(group, "master", "failed")}


def _fail_stale(group_key: str, waiters: int) -> None:
    group = _groups.get(group_key)
    if group is None:
        return
    group.error = "master_lost"
    _log_event("fail", group_key, group.master_id, {
        "role": "master", "status": "failed", "error": "master_lost", "waiters": waiters,
    })


def get(group_key: str, client_id: str) -> dict[str, Any]:
    current = _now()
    with _lock:
        _cleanup(current)
        group = _groups.get(group_key)
        if group is None:
            return {"group_key": group_key, "role": "slave", "status": "expired"}
        role = "master" if group.master_id == client_id else "slave"
        if group.slots_response is not None:
            return _snapshot(group, role, "ready")
        if group.error is not None:
            return _snapshot(group, role, "failed")
        return _snapshot(group, role, "pending")


async def wait_for_slots(group_key: str, client_id: str, wait_ms: int) -> dict[str, Any]:
    import asyncio

    deadline = _now() + min(max(wait_ms, 0), MAX_WAIT_MS) / 1000
    while True:
        snapshot = get(group_key, client_id)
        if snapshot["status"] != "pending":
            _log_event("wait_end", group_key, client_id, {"role": "slave", "status": snapshot["status"]})
            return snapshot

        current = _now()
        if current >= deadline:
            _log_event("wait_timeout", group_key, client_id, {"role": "slave", "status": "timeout", "wait_ms": wait_ms})
            return snapshot

        with _lock:
            group = _groups.get(group_key)
            if group and group.error is None and group.slots_response is None and group.last_heartbeat_at > 0:
                if current - group.last_heartbeat_at >= MASTER_TIMEOUT:
                    _fail_stale(group_key, group.waiters)
                    _log_event("wait_end", group_key, client_id, {"role": "slave", "status": "failed", "error": "master_lost"})
                    return {"group_key": group_key, "role": "slave", "status": "failed", "error": "master_lost"}

        await asyncio.sleep(0.05)


def heartbeat(group_key: str, client_id: str) -> dict[str, Any]:
    current = _now()
    with _lock:
        group = _groups.get(group_key)
        if group is None:
            return {"ok": False, "error": "group_expired"}
        if group.master_id != client_id:
            return {"ok": False, "error": "not_master"}
        group.last_heartbeat_at = current
        remaining = int(group.expires_at - current)
        _log_event("master_alive", group_key, client_id, {
            "role": "master",
            "remaining": max(remaining, 0),
            "waiters": group.waiters,
        })
        return {"ok": True, "remaining": max(remaining, 0), "waiters": group.waiters}


def clear() -> dict[str, Any]:
    with _lock:
        _groups.clear()
        _event_log.clear()
        return {"ok": True}


def stats() -> dict[str, Any]:
    current = _now()
    with _lock:
        _cleanup(current)
        return {
            "groups": len(_groups),
            "ready": sum(1 for g in _groups.values() if g.slots_response is not None),
            "pending": sum(
                1
                for g in _groups.values()
                if g.slots_response is None and g.error is None
            ),
        }

