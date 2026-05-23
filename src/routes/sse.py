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

from fastapi import Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from src.repositories import api_key_repo
from src.sse import lock, register_sse_connection, sse_queues, unregister_sse_connection


def _parse_help_for(raw: str | None) -> set[int]:
    if not raw:
        return set()
    result = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            result.add(int(part))
    return result


def register_sse_routes(app):
    @app.get("/check-stream")
    async def check_stream(
        api_key: str = Query(...), super_kiosk: int = Query(0), help_for: str = Query(None)
    ):
        key_record = api_key_repo.get_key_record(api_key)
        if not key_record:
            return JSONResponse(
                status_code=401, content={"valid": False, "error": "Invalid API key"}
            )
        api_key_id = key_record.id
        effective_id = -1 if (super_kiosk and api_key_repo.is_super_kiosk_key(api_key)) else api_key_id
        with lock:
            queues = sse_queues.get(effective_id, [])
            has_active = len(queues) > 0
        return JSONResponse(
            content={
                "valid": True,
                "has_active_stream": has_active,
                "super_kiosk": bool(super_kiosk and api_key_repo.is_super_kiosk_key(api_key)),
            }
        )

    @app.get("/stream")
    async def sse_stream(
        request: Request,
        api_key: str = Query(...),
        super_kiosk: int = Query(0),
        help_for: str = Query(None),
    ):
        key_record = api_key_repo.get_key_record(api_key)
        if not key_record:
            return StreamingResponse(
                status_code=401,
                content='{"error": "Invalid or missing API key"}',
                media_type="application/json",
            )

        is_super = super_kiosk and api_key_repo.is_super_kiosk_key(api_key)

        if super_kiosk and not key_record.is_admin:
            return StreamingResponse(
                status_code=403,
                content='{"error": "Super kiosk requires admin key"}',
                media_type="application/json",
            )

        api_key_id = -1 if is_super else key_record.id
        real_api_key_id = key_record.id if is_super else None
        help_for_set = _parse_help_for(help_for) if is_super else None
        client_ip = request.client.host if request.client else "unknown"

        q, displaced = register_sse_connection(
            api_key_id, client_ip, real_api_key_id=real_api_key_id, help_for=help_for_set
        )

        if displaced:
            unregister_sse_connection(q, api_key_id)

            async def reject_stream():
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

        async def event_stream():
            try:
                while True:
                    try:
                        item = await asyncio.wait_for(q.get(), timeout=15.0)
                        yield item
                    except TimeoutError:
                        yield ": keepalive\n\n"
            except GeneratorExit:
                pass
            finally:
                unregister_sse_connection(q, api_key_id)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
