"""Captcha record routes.

This route module intentionally contains no authorization or persistence logic;
those live in the captcha-record service and repository layers.
"""

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from src.models import SendSelectedCaptchasBody
from src.policies.access_policy import token_from_request
from src.services import captcha_records_service
from src.services import captcha_service

router = APIRouter(tags=["captchas"])


@router.get("/public/captchas")
async def get_public_captchas(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    from src.db.captchas import list_public_captchas

    return JSONResponse(content=list_public_captchas(limit=limit, offset=offset))


@router.post("/public/captchas/send-selected")
async def send_public_selected_captchas(body: SendSelectedCaptchasBody):
    captcha_ids = list(dict.fromkeys(body.captcha_ids))
    if not captcha_ids:
        return JSONResponse(status_code=400, content={"error": "No captchas selected"})
    sent = captcha_service.replay_captchas(captcha_ids)
    if sent is None:
        return JSONResponse(status_code=400, content={"error": "No active SSE connections"})
    if sent == 0:
        return JSONResponse(status_code=400, content={"error": "No replayable captcha payloads"})
    return JSONResponse(content={"sent": sent})


@router.get("/captchas")
async def get_captchas(
    request: Request,
    usage_log_id: int | None = Query(None),
):
    status, content = captcha_records_service.list_records(
        token_from_request(request),
        usage_log_id,
    )
    return JSONResponse(status_code=status, content=content)


@router.get("/captchas/{captcha_id}")
async def get_captcha(captcha_id: int, request: Request):
    status, content = captcha_records_service.get_record(
        token_from_request(request),
        captcha_id,
    )
    return JSONResponse(status_code=status, content=content)


@router.delete("/captchas/{captcha_id}")
async def delete_captcha_record(captcha_id: int, request: Request):
    status, content = captcha_records_service.delete_record(
        token_from_request(request),
        captcha_id,
    )
    return JSONResponse(status_code=status, content=content)
