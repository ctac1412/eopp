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
from src.sse import lock, register_sse_connection, sse_queues, unregister_sse_connection

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


@router.get("/check-stream")
async def check_stream(
    api_key: str = Query(...), super_kiosk: int = Query(0), help_for: str = Query(None)
):
    start = time.perf_counter()
    key_record = api_key_repo.get_key_record(api_key)
    if not key_record:
        logger.warning(
            "sse_check_stream status=401 super_kiosk=%s duration_ms=%.1f",
            bool(super_kiosk),
            (time.perf_counter() - start) * 1000,
        )
        return JSONResponse(
            status_code=401, content={"valid": False, "error": "Invalid API key"}
        )
    api_key_id = key_record.id
    effective_id = -1 if (super_kiosk and api_key_repo.is_super_kiosk_key(api_key)) else api_key_id
    with lock:
        queues = sse_queues.get(effective_id, [])
        has_active = len(queues) > 0
    logger.info(
        "sse_check_stream status=200 api_key_id=%s effective_id=%s super_kiosk=%s has_active=%s queues=%s duration_ms=%.1f",
        api_key_id,
        effective_id,
        bool(super_kiosk and api_key_repo.is_super_kiosk_key(api_key)),
        has_active,
        len(queues),
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
    api_key: str = Query(...),
    super_kiosk: int = Query(0),
    help_for: str = Query(None),
    force: int = Query(0),
):
    connected_at = time.perf_counter()
    client_ip = request.client.host if request.client else "unknown"
    key_record = api_key_repo.get_key_record(api_key)
    if not key_record:
        logger.warning("sse_stream_auth status=401 ip=%s super_kiosk=%s", client_ip, bool(super_kiosk))
        return StreamingResponse(
            status_code=401,
            content='{"error": "Invalid or missing API key"}',
            media_type="application/json",
        )

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

        from src.sse.manager import sse_connections, sse_queues, lock as sse_lock
        with sse_lock:
            old_queues = sse_queues.get(api_key_id, [])[:]
            sse_queues[api_key_id] = [q]
            sse_connections[:] = [c for c in sse_connections if c.get("api_key_id") != api_key_id]
            sse_connections.append({
                "queue": q, "api_key_id": api_key_id, "real_api_key_id": real_api_key_id,
                "ip": client_ip, "connected_at": time.time(),
            })
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
            from src.sse.manager import operator_api_key_id as op_neg_id, sse_queues as _sse_queues, lock as _sse_lock, push_sse as _push
            op_ids = operator_repo.get_subscribed_operators(key_record.id)
            online_ops = []
            with _sse_lock:
                for oid in op_ids:
                    if _sse_queues.get(op_neg_id(oid)):
                        online_ops.append(oid)
            yield "data: %s\n\n" % json.dumps({
                "type": "connected",
                "api_key_id": api_key_id,
                "operators_online": online_ops,
                "owner_label": key_record.label,
            })
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
