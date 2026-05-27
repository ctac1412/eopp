"""SSE global state and operations."""

import asyncio
import json
import logging
import threading
import time
from datetime import UTC, datetime

logger = logging.getLogger("eopp.sse")

pending = {}
sse_queues: dict[int | None, list[asyncio.Queue]] = {}
sse_connections: list[dict] = []
super_kiosk_subscriptions: dict[int, set[int]] = {}
lock = threading.Lock()
queue_subscriptions: dict[int, set[int]] = {}


def push_sse(msg, api_key_id=None):
    event_type = msg.get("type") if isinstance(msg, dict) else None
    captcha_id = msg.get("captcha_id") if isinstance(msg, dict) else None
    data = f"data: {json.dumps(msg)}\n\n"
    dead_queues = []
    with lock:
        if api_key_id is not None:
            queues = list(sse_queues.get(api_key_id, []))
            if api_key_id != -1:
                for q in sse_queues.get(-1, []):
                    qid = id(q)
                    subs = queue_subscriptions.get(qid, set())
                    if not subs or api_key_id in subs:
                        queues.append(q)
        else:
            queues = []
            for v in sse_queues.values():
                queues.extend(v)
        for q in queues:
            try:
                q.put_nowait(data)
            except Exception:
                dead_queues.append(q)
        for q in dead_queues:
            for v in sse_queues.values():
                if q in v:
                    v.remove(q)
    logger.info(
        "sse_push event=%s captcha=%s target_api_key_id=%s delivered=%s dead=%s",
        event_type or "-",
        captcha_id or "-",
        api_key_id if api_key_id is not None else "broadcast",
        len(queues) - len(dead_queues),
        len(dead_queues),
    )


def register_sse_connection(
    api_key_id: int | None,
    ip: str,
    real_api_key_id: int | None = None,
    help_for: set[int] | None = None,
) -> tuple[asyncio.Queue, bool]:
    q: asyncio.Queue = asyncio.Queue()
    displaced = False
    with lock:
        existing = sse_queues.get(api_key_id, [])
        if existing and api_key_id != -1:
            displaced = True
        else:
            sse_queues.setdefault(api_key_id, []).append(q)
            conn_info = {
                "queue": q,
                "api_key_id": api_key_id,
                "real_api_key_id": real_api_key_id,
                "ip": ip,
                "connected_at": time.time(),
            }
            sse_connections.append(conn_info)
            if api_key_id == -1 and real_api_key_id is not None:
                subs = set(help_for) if help_for is not None else set()
                queue_subscriptions[id(q)] = subs
                super_kiosk_subscriptions[real_api_key_id] = subs
    logger.info(
        "sse_register api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s displaced=%s help_for=%s",
        api_key_id,
        real_api_key_id,
        ip,
        id(q),
        displaced,
        ",".join(str(x) for x in sorted(help_for or [])) if help_for is not None else "-",
    )
    return q, displaced


def unregister_sse_connection(q: asyncio.Queue, api_key_id: int | None):
    conn_info = None
    with lock:
        queues_for_key = sse_queues.get(api_key_id, [])
        if q in queues_for_key:
            queues_for_key.remove(q)
        conn_info = next((c for c in sse_connections if c["queue"] is q), None)
        sse_connections[:] = [c for c in sse_connections if c["queue"] is not q]
        qid = id(q)
        if qid in queue_subscriptions:
            del queue_subscriptions[qid]
        if conn_info and conn_info.get("real_api_key_id") is not None:
            super_kiosk_subscriptions.pop(conn_info["real_api_key_id"], None)
    logger.info(
        "sse_unregister api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s connected_for_ms=%.1f",
        api_key_id,
        conn_info.get("real_api_key_id") if conn_info else None,
        conn_info.get("ip") if conn_info else "-",
        id(q),
        (time.time() - conn_info["connected_at"]) * 1000 if conn_info else 0.0,
    )


def get_connected_streams() -> list[dict]:
    from src.repositories import api_key_repo

    with lock:
        result = []
        for c in sse_connections:
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
