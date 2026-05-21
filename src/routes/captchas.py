"""
EOPP Captcha Solver - Captchas Routes

Эндпоинты для работы с таблицей captchas:
- GET /captchas - список всех капч
- GET /captchas/{id} - конкретная капча
- GET /captchas/by-usage-log/{usage_log_id} - капчи по usage_log_id
- DELETE /captchas/{id} - удаление записи
"""

from fastapi import Query
from fastapi.responses import JSONResponse

from src.db.captchas import (
    list_captchas,
    get_captcha_by_id,
    delete_captcha,
)


def register_captchas_routes(app):
    @app.get("/captchas")
    async def get_captchas(
        usage_log_id: int | None = Query(None),
    ):
        records = list_captchas(usage_log_id)
        return JSONResponse(content=records)

    @app.get("/captchas/{captcha_id}")
    async def get_captcha(captcha_id: int):
        record = get_captcha_by_id(captcha_id)
        if not record:
            return JSONResponse(status_code=404, content={"error": "Captcha record not found"})
        return JSONResponse(content=record)

    @app.delete("/captchas/{captcha_id}")
    async def delete_captcha_record(captcha_id: int):
        ok = delete_captcha(captcha_id)
        if not ok:
            return JSONResponse(status_code=404, content={"error": "Captcha record not found"})
        return JSONResponse(content={"ok": True})
