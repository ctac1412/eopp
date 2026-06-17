"""
EOPP Captcha Solver - SSE Routes

Эндпоинты:
- GET /stream - SSE поток для получения новых капч

События:
- new_captcha: новая капча с вариантами
- captcha_solved: капча решена
- captcha_timeout: истек таймаут ожидания
- disconnected: другое подключение активно

Требует валидный API ключ в query параметре.
"""

import asyncio
import json
import logging
import time

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from src.repositories import api_key_repo
from src.routes.chat import get_chat_history
from src.routes.scheduled import get_scheduled_events_for_masters
from src.services.session_api_key import key_for_session_request
from src.sse import register_sse_connection, replace_sse_connections, unregister_sse_connection
from src.sse.manager import registry as realtime_registry

logger = logging.getLogger("eopp.sse")
router = APIRouter(tags=["sse"])


def _parse_help_for(raw: str | None) -> set[int]:
    if not raw:
        return set()
    result = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            result.add(int(part))
    return result


def _pending_snapshot_events(
    pending_map,
    distribution_states,
    *,
    api_key_id: int,
    owner_label: str,
    timeout: int | float,
    now: float | None = None,
) -> list[dict]:
    """Return SSE events needed to restore active captchas after reconnect."""

    created_at = time.time() if now is None else now
    events = []
    for entry in list(pending_map.values()):
        entry_api_key_id = entry.get("api_key_id") if hasattr(entry, "get") else None
        if entry_api_key_id != api_key_id or entry.get("result") is not None:
            continue

        captcha_id = entry.get("captcha_id")
        images = entry.get("images", {}) or {}
        captcha_event = {
            "type": "new_captcha",
            "captcha_id": captcha_id,
            "images": images,
            "count": len(images),
            "top3": [],
            "confident": False,
            "created_at": created_at,
            "timeout": entry.get("timeout", timeout),
            "owner_label": owner_label,
            "owner_api_key_id": api_key_id,
        }
        if entry.get("captcha_type") is not None:
            captcha_event["captcha_type"] = entry.get("captcha_type")
        if entry.get("icons_image"):
            captcha_event["icons_image"] = entry.get("icons_image")
        if entry.get("distribution") is not None:
            captcha_event["distribution"] = entry.get("distribution")
        events.append(captcha_event)

        dist_state = distribution_states.get(captcha_id)
        if dist_state and dist_state.get("api_key_id") == api_key_id:
            all_answers = dict(dist_state.get("all_answers") or {})
            if all_answers:
                events.append(
                    {
                        "type": "distribution_progress",
                        "captcha_id": captcha_id,
                        "solved_count": len(all_answers),
                        "total_icons": dist_state.get("total_icons", 5),
                        "answered_positions": sorted(all_answers.keys()),
                        "all_coords": all_answers,
                    }
                )
    return events


@router.get("/check-stream")
async def check_stream(
    request: Request, super_kiosk: int = Query(0), help_for: str = Query(None)
):
    start = time.perf_counter()
    key_record, error = key_for_session_request(request)
    if error:
        return error
    if request.query_params.get("api_key"):
        return JSONResponse(status_code=400, content={"valid": False, "error": "api_key is no longer accepted"})
    api_key = key_record.key
    api_key_id = key_record.id
    effective_id = -1 if (super_kiosk and api_key_repo.is_super_kiosk_key(api_key)) else api_key_id
    has_active = realtime_registry.has_connection(effective_id)
    logger.info(
        "sse_check_stream status=200 api_key_id=%s effective_id=%s super_kiosk=%s has_active=%s queues=%s duration_ms=%.1f",
        api_key_id,
        effective_id,
        bool(super_kiosk and api_key_repo.is_super_kiosk_key(api_key)),
        has_active,
        len(realtime_registry.snapshot(effective_id)),
        (time.perf_counter() - start) * 1000,
    )
    return JSONResponse(
        content={
            "valid": True,
            "has_active_stream": has_active,
            "super_kiosk": bool(super_kiosk and api_key_repo.is_super_kiosk_key(api_key)),
        }
    )


@router.get("/stream")
async def sse_stream(
    request: Request,
    super_kiosk: int = Query(0),
    help_for: str = Query(None),
    force: int = Query(0),
):
    connected_at = time.perf_counter()
    client_ip = request.client.host if request.client else "unknown"
    key_record, error = key_for_session_request(request)
    if error:
        logger.warning("sse_stream_auth status=%s ip=%s super_kiosk=%s", error.status_code, client_ip, bool(super_kiosk))
        return StreamingResponse(
            status_code=error.status_code,
            content='{"error": "Unauthorized"}',
            media_type="application/json",
        )
    if request.query_params.get("api_key"):
        return StreamingResponse(
            status_code=400,
            content='{"error": "api_key is no longer accepted"}',
            media_type="application/json",
        )
    api_key = key_record.key

    is_super = super_kiosk and api_key_repo.is_super_kiosk_key(api_key)

    if super_kiosk and not key_record.is_admin:
        logger.warning(
            "sse_stream_auth status=403 api_key_id=%s ip=%s reason=super_requires_admin",
            key_record.id,
            client_ip,
        )
        return StreamingResponse(
            status_code=403,
            content='{"error": "Super kiosk requires admin key"}',
            media_type="application/json",
        )

    api_key_id = -1 if is_super else key_record.id
    real_api_key_id = key_record.id if is_super else None
    help_for_set = _parse_help_for(help_for) if is_super else None

    q, displaced = register_sse_connection(
        api_key_id, client_ip, real_api_key_id=real_api_key_id, help_for=help_for_set
    )
    logger.info(
        "sse_stream_open api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s super=%s displaced=%s help_for=%s",
        api_key_id,
        real_api_key_id,
        client_ip,
        id(q),
        bool(is_super),
        displaced,
        ",".join(str(x) for x in sorted(help_for_set or [])) if help_for_set is not None else "-",
    )

    if displaced:
        if not force:
            unregister_sse_connection(q, api_key_id)

            async def reject_stream():
                logger.warning(
                    "sse_stream_reject api_key_id=%s ip=%s queue_id=%s reason=displaced",
                    api_key_id,
                    client_ip,
                    id(q),
                )
                yield 'data: {"type": "disconnected", "message": "Другое подключение уже активно"}\n\n'

            return StreamingResponse(
                reject_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )

        old_queues = replace_sse_connections(api_key_id, q, client_ip, real_api_key_id)
        for old_q in old_queues:
            try:
                old_q.put_nowait(json.dumps({"type": "disconnected", "message": "Подключение перехвачено"}))
            except Exception:
                pass
        logger.info(
            "sse_stream_force_takeover api_key_id=%s ip=%s old_queues=%d",
            api_key_id, client_ip, len(old_queues),
        )

    async def event_stream():
        yielded = 0
        keepalives = 0
        op_ids: list[int] = []

        if not is_super and real_api_key_id is None:
            from src.repositories import operator_repo
            from src.sse.manager import operator_api_key_id as op_neg_id, push_sse as _push
            op_ids = operator_repo.get_subscribed_operators(key_record.id)
            realtime_registry.set_master_operators(key_record.id, op_ids)
            online_ops = []
            online_ops_info = []
            for oid in op_ids:
                if realtime_registry.has_connection(op_neg_id(oid)):
                    online_ops.append(oid)
                    op_info = operator_repo.get_operator_by_id(oid)
                    online_ops_info.append({
                        "id": oid,
                        "nickname": op_info.get("nickname", f"#{oid}") if op_info else f"#{oid}",
                    })
            yield "data: %s\n\n" % json.dumps({
                "type": "connected",
                "api_key_id": api_key_id,
                "operators_online": online_ops,
                "operators_online_info": online_ops_info,
                "owner_label": key_record.label,
                "chat_history": get_chat_history(key_record.id),
                "scheduled_events": get_scheduled_events_for_masters([key_record.id]),
            })
            # Push current slot layout to master (for F5)
            try:
                from src.routes.operator import _push_slot_update
                await _push_slot_update(key_record.id)
            except Exception as exc:
                logger.error("sse_slot_push_error key=%s %s", key_record.id, exc)
            try:
                from src.routes.captcha import captcha_timeout
                from src.routes.distribution import distribution_states
                from src.sse import lock as sse_lock, pending as sse_pending

                with sse_lock:
                    snapshot_events = _pending_snapshot_events(
                        sse_pending,
                        distribution_states,
                        api_key_id=key_record.id,
                        owner_label=key_record.label,
                        timeout=captcha_timeout,
                    )
                for event in snapshot_events:
                    q.put_nowait("data: %s\n\n" % json.dumps(event))
                if snapshot_events:
                    logger.info(
                        "sse_pending_snapshot api_key_id=%s events=%s",
                        key_record.id,
                        len(snapshot_events),
                    )
            except Exception as exc:
                logger.error("sse_pending_snapshot_error key=%s %s", key_record.id, exc)
            for oid in op_ids:
                _push({
                    "type": "master_online",
                    "master_key_id": key_record.id,
                    "master_label": key_record.label,
                }, api_key_id=op_neg_id(oid))
            logger.info(
                "sse_master_online api_key_id=%s label=%s ops=%s online=%s",
                key_record.id, key_record.label, op_ids, online_ops,
            )

        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=15.0)
                    yielded += 1
                    logger.info(
                        "sse_stream_yield api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s event_index=%s bytes=%s",
                        api_key_id,
                        real_api_key_id,
                        client_ip,
                        id(q),
                        yielded,
                        len(item),
                    )
                    yield item
                except TimeoutError:
                    keepalives += 1
                    logger.info(
                        "sse_stream_keepalive api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s count=%s",
                        api_key_id,
                        real_api_key_id,
                        client_ip,
                        id(q),
                        keepalives,
                    )
                    yield ": keepalive\n\n"
        except GeneratorExit:
            logger.info(
                "sse_stream_generator_exit api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s",
                api_key_id,
                real_api_key_id,
                client_ip,
                id(q),
            )
            pass
        finally:
            unregister_sse_connection(q, api_key_id)
            if not is_super and real_api_key_id is None:
                for oid in op_ids:
                    _push({
                        "type": "master_offline",
                        "master_key_id": key_record.id,
                        "master_label": key_record.label,
                    }, api_key_id=op_neg_id(oid))
                logger.info(
                    "sse_master_offline api_key_id=%s label=%s ops=%s",
                    key_record.id, key_record.label, op_ids,
                )
            logger.info(
                "sse_stream_close api_key_id=%s real_api_key_id=%s ip=%s queue_id=%s events=%s keepalives=%s duration_ms=%.1f",
                api_key_id,
                real_api_key_id,
                client_ip,
                id(q),
                yielded,
                keepalives,
                (time.perf_counter() - connected_at) * 1000,
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
