"""Scheduled events — in-memory storage with TTL and SSE push to operators."""

import asyncio
import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.models import ScheduledEventBody
from src.repositories import operator_repo
from src.services.session_api_key import key_for_session_request
from src.sse import push_sse
from src.sse.manager import operator_api_key_id

logger = logging.getLogger("eopp.scheduled")

router = APIRouter(tags=["scheduled"])

# In-memory storage: {api_key_id: [event_dict, ...]}
_scheduled_events: dict[int, list[dict]] = {}


def _cleanup_expired(api_key_id: int) -> None:
    """Remove events older than 30 min past scheduled_at for a given api_key_id."""
    now = time.time()
    events = _scheduled_events.get(api_key_id, [])
    if not events:
        return
    _scheduled_events[api_key_id] = [
        e for e in events if now - e.get("scheduled_at_ts", 0) < 1800
    ]
    if not _scheduled_events[api_key_id]:
        _scheduled_events.pop(api_key_id, None)


def get_scheduled_events_for_masters(master_ids: list[int]) -> list[dict]:
    """Return all scheduled events for a list of master api_key_ids."""
    result: list[dict] = []
    now = time.time()
    for mid in master_ids:
        events = _scheduled_events.get(mid, [])
        for e in events:
            if now - e.get("scheduled_at_ts", 0) < 1800:
                result.append(e)
    result.sort(key=lambda e: e.get("scheduled_at_ts", 0))
    return result


@router.get("/admin/scheduled-events")
async def admin_scheduled_events(request: Request, include_test: bool = True):
    """Return active scheduled events for the admin operations dashboard."""
    raw_master_ids = request.query_params.get("master_ids", "")
    if raw_master_ids.strip():
        try:
            master_ids = [
                int(part.strip())
                for part in raw_master_ids.split(",")
                if part.strip()
            ]
        except ValueError:
            return JSONResponse(status_code=400, content={"error": "Invalid master_ids"})
    else:
        master_ids = list(_scheduled_events.keys())
    if not include_test:
        from src.repositories import api_key_repo

        master_ids = [
            master_id
            for master_id in master_ids
            if not api_key_repo.is_test_user_key(master_id)
        ]

    return JSONResponse(content=get_scheduled_events_for_masters(master_ids))


async def _auto_remove_after(event: dict, api_key_id: int, delay_seconds: float) -> None:
    """Remove event automatically after delay."""
    await asyncio.sleep(delay_seconds)
    try:
        events = _scheduled_events.get(api_key_id, [])
        if event in events:
            events.remove(event)
            if not events:
                _scheduled_events.pop(api_key_id, None)
            logger.info("scheduled_event_auto_removed api_key=%s label=%s", api_key_id, event.get("label"))
    except Exception as exc:
        logger.error("scheduled_auto_remove_error %s", exc)


@router.post("/scheduled-event")
async def create_scheduled_event(body: ScheduledEventBody, request: Request):
    """Register a scheduled event and push to all operators of the master."""
    key_record, error = key_for_session_request(request)
    if error:
        return error
    api_key_id = key_record.id

    from datetime import UTC, datetime

    try:
        scheduled_at_ts = datetime.fromisoformat(body.scheduled_at).timestamp()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid scheduled_at format, use ISO"})

    event = {
        "type": "scheduled_event",
        "api_key_id": api_key_id,
        "label": body.label,
        "scheduled_at": body.scheduled_at,
        "scheduled_at_ts": scheduled_at_ts,
        "description": body.description,
    }

    _cleanup_expired(api_key_id)

    # Remove any existing event with the same label (one plan per reservation)
    existing = _scheduled_events.setdefault(api_key_id, [])
    existing[:] = [e for e in existing if e.get("label") != body.label]
    existing.append(event)

    # Push to all online operators of this master
    op_ids = operator_repo.get_subscribed_operators(api_key_id)
    for op_id in op_ids:
        push_sse(event, api_key_id=operator_api_key_id(op_id))

    # Push to master too
    push_sse(event, api_key_id=api_key_id)

    # Auto-remove 30 min after scheduled_at
    delay = max(0, scheduled_at_ts + 1800 - time.time())
    asyncio.create_task(_auto_remove_after(event, api_key_id, delay))

    logger.info(
        "scheduled_event api_key=%s label=%s ops=%d auto_remove_delay=%ds",
        api_key_id, body.label, len(op_ids), delay,
    )

    return JSONResponse(content={"ok": True, "delivered_to_operators": len(op_ids)})
