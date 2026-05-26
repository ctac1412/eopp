"""Captcha record routes.

This route module intentionally contains no authorization or persistence logic;
those live in the captcha-record service and repository layers.
"""

from fastapi import Query, Request
from fastapi.responses import JSONResponse

from src.models import SendSelectedCaptchasBody
from src.services import captcha_records_service
from src.services import captcha_service


def register_captchas_routes(app):
    @app.get("/public/captchas")
    async def get_public_captchas():
        from src.db.captchas import list_public_captchas

        return JSONResponse(content=list_public_captchas())

    @app.post("/public/captchas/send-selected")
    async def send_public_selected_captchas(body: SendSelectedCaptchasBody):
        captcha_ids = list(dict.fromkeys(body.captcha_ids))
        if not captcha_ids:
            return JSONResponse(status_code=400, content={"error": "No captchas selected"})
        sent = captcha_service.replay_captchas(captcha_ids)
        if sent is None:
            return JSONResponse(status_code=400, content={"error": "No active SSE connections"})
        return JSONResponse(content={"sent": sent})

    @app.get("/captchas")
    async def get_captchas(
        request: Request,
        usage_log_id: int | None = Query(None),
    ):
        status, content = captcha_records_service.list_records(
            request.headers.get("X-Admin-Token"),
            usage_log_id,
        )
        return JSONResponse(status_code=status, content=content)

    @app.get("/captchas/{captcha_id}")
    async def get_captcha(captcha_id: int, request: Request):
        status, content = captcha_records_service.get_record(
            request.headers.get("X-Admin-Token"),
            captcha_id,
        )
        return JSONResponse(status_code=status, content=content)

    @app.delete("/captchas/{captcha_id}")
    async def delete_captcha_record(captcha_id: int, request: Request):
        status, content = captcha_records_service.delete_record(
            request.headers.get("X-Admin-Token"),
            captcha_id,
        )
        return JSONResponse(status_code=status, content=content)
