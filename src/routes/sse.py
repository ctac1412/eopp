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
from fastapi.responses import StreamingResponse

from src.db import get_key_record
from src.utils import (
    register_sse_connection,
    unregister_sse_connection,
)


def register_sse_routes(app):
    @app.get("/stream")
    async def sse_stream(request: Request, api_key: str = Query(...)):
        key_record = get_key_record(api_key)
        if not key_record:
            return StreamingResponse(
                status_code=401,
                content='{"error": "Invalid or missing API key"}',
                media_type="application/json",
            )
        api_key_id = key_record["id"]
        client_ip = request.client.host if request.client else "unknown"

        q, displaced = register_sse_connection(api_key_id, client_ip)

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
                    except asyncio.TimeoutError:
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
