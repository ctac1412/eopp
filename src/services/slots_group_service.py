"""In-memory coordination for shared AvailableSlots responses."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import RLock
from typing import Any


GROUP_TTL_SECONDS = 60.0
DEFAULT_WAIT_MS = 450
MAX_WAIT_MS = 5000


@dataclass
class SlotsGroup:
    group_key: str
    master_id: str
    created_at: float
    expires_at: float
    slots_response: dict[str, Any] | None = None
    error: str | None = None
    published_at: float | None = None
    waiters: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


_lock = RLock()
_groups: dict[str, SlotsGroup] = {}


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
            return _snapshot(group, "master", "claimed")

        if group.slots_response is not None:
            return _snapshot(group, "slave", "ready")

        if group.error is not None:
            return _snapshot(group, "slave", "failed")

        if group.master_id == client_id:
            return _snapshot(group, "master", "claimed")

        group.waiters += 1
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
        return {"ok": True, **_snapshot(group, "master", "failed")}


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
            return snapshot
        if _now() >= deadline:
            return snapshot
        await asyncio.sleep(0.05)


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

