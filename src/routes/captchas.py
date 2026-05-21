"""
EOPP Captcha Solver - Captchas Routes

Эндпоинты для работы с таблицей captchas:
- GET /captchas - список всех капч
- GET /captchas/{id} - конкретная капча
- GET /captchas/by-usage-log/{usage_log_id} - капчи по usage_log_id
- DELETE /captchas/{id} - удаление записи
"""

from fastapi import Query, Request
from fastapi.responses import JSONResponse

from src.db import check_admin_token
from src.db.captchas import (
    list_captchas,
    get_captcha_by_id,
    delete_captcha,
)


def _require_admin(request: Request) -> JSONResponse | None:
    token = request.headers.get("X-Admin-Token")
    if token and check_admin_token(token):
        return None
    return JSONResponse(status_code=401, content={"error": "Unauthorized"})


def register_captchas_routes(app):
    @app.get("/captchas")
    async def get_captchas(
        request: Request,
        usage_log_id: int | None = Query(None),
    ):
        unauthorized = _require_admin(request)
        if unauthorized:
            return unauthorized
        records = list_captchas(usage_log_id)
        return JSONResponse(content=records)

    @app.get("/captchas/{captcha_id}")
    async def get_captcha(captcha_id: int, request: Request):
        unauthorized = _require_admin(request)
        if unauthorized:
            return unauthorized
        record = get_captcha_by_id(captcha_id)
        if not record:
            return JSONResponse(status_code=404, content={"error": "Captcha record not found"})
        return JSONResponse(content=record)

    @app.delete("/captchas/{captcha_id}")
    async def delete_captcha_record(captcha_id: int, request: Request):
        unauthorized = _require_admin(request)
        if unauthorized:
            return unauthorized
        ok = delete_captcha(captcha_id)
        if not ok:
            return JSONResponse(status_code=404, content={"error": "Captcha record not found"})
        return JSONResponse(content={"ok": True})
