"""Webhook endpoint for rucaptcha pingback.

Receives POST from rucaptcha when a captcha is solved.
Matches task ID to pending auto-solve and injects answer into distribution.

No auth required — rucaptcha servers call this directly.
"""

import asyncio
import json
import logging
from urllib.parse import unquote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse

logger = logging.getLogger("eopp.callback")

router = APIRouter(prefix="/rucaptcha-callback", tags=["rucaptcha"])


@router.post("")
async def rucaptcha_callback(request: Request):
    """Receive solved captcha from rucaptcha webhook."""
    from src.auto_operator import handle_callback

    client_ip = request.client.host if request.client else "-"

    try:
        body = await request.body()
        body_str = body.decode("utf-8", errors="replace")
    except Exception as exc:
        logger.error("rucaptcha_callback_body_read_error ip=%s %s", client_ip, exc)
        return JSONResponse(status_code=400, content={"error": "cannot read body"})

    logger.info("rucaptcha_callback_hit ip=%s body=%s", client_ip, body_str[:300])

    # Parse URL-encoded form data
    params = {}
    for pair in body_str.split("&"):
        if "=" in pair:
            key, val = pair.split("=", 1)
            params[key.strip()] = unquote(val.strip())

    task_id = params.get("id", "")
    code = params.get("code", "")

    if not task_id or not code:
        logger.warning("rucaptcha_callback_missing_params body=%s", body_str[:200])
        return JSONResponse(status_code=400, content={"error": "missing id or code"})

    logger.info("rucaptcha_callback_received task_id=%s code=%s", task_id, code[:80])

    # Process asynchronously so rucaptcha gets quick 200
    asyncio.create_task(handle_callback(task_id, code))

    return JSONResponse(content={"ok": True})


# Domain verification file (JWT from rucaptcha pingback settings)
_RUCAPTCHA_TXT = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJ1c2VySWQiOiIyODAyMzQ0OSIsImlhdCI6MTc4MTA5MTI3Mn0."
    "KynNNoicRtII-n2EXv2H2lxyYbvcomQgq42TZmkwRhg"
)

txt_router = APIRouter(tags=["rucaptcha"])


@txt_router.get("/rucaptcha.txt")
async def rucaptcha_txt():
    """Serve domain verification file for rucaptcha pingback."""
    return PlainTextResponse(content=_RUCAPTCHA_TXT, media_type="text/plain")
