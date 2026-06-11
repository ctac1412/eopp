"""Webhook endpoint for rucaptcha pingback.

Receives POST from rucaptcha when a captcha is solved.
Matches task ID to pending auto-solve and injects answer into distribution.

Security: IP whitelist or HMAC signature can be configured via env.
- RUCAPTCHA_CALLBACK_IPS: comma-separated IPs allowed to call this endpoint
- RUCAPTCHA_CALLBACK_SECRET: shared HMAC secret (validated via X-Signature header)

If neither is set, the callback will reject requests with 403.
"""

import hashlib
import hmac
import os
import asyncio
import logging
from urllib.parse import unquote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse

logger = logging.getLogger("eopp.callback")

router = APIRouter(prefix="/rucaptcha-callback", tags=["rucaptcha"])

_RUCAPTCHA_IPS: set[str] = set()
_raw_ips = os.environ.get("RUCAPTCHA_CALLBACK_IPS", "").strip()
if _raw_ips:
    _RUCAPTCHA_IPS = {ip.strip() for ip in _raw_ips.split(",") if ip.strip()}

_RUCAPTCHA_SECRET = os.environ.get("RUCAPTCHA_CALLBACK_SECRET", "").strip()


def _verify_request(request: Request, body: bytes) -> str | None:
    client_ip = request.client.host if request.client else "-"

    if not _RUCAPTCHA_IPS and not _RUCAPTCHA_SECRET:
        logger.warning("rucaptcha_callback_not_configured — set RUCAPTCHA_CALLBACK_IPS or RUCAPTCHA_CALLBACK_SECRET")
        return "callback not configured (no IP whitelist, no HMAC secret)"

    if _RUCAPTCHA_IPS:
        if client_ip not in _RUCAPTCHA_IPS:
            return f"IP {client_ip} not in whitelist"

    if _RUCAPTCHA_SECRET:
        signature = request.headers.get("X-Signature", "").strip()
        expected = hmac.new(
            _RUCAPTCHA_SECRET.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()
        if signature.startswith("sha256="):
            signature = signature.removeprefix("sha256=")
        if not hmac.compare_digest(signature, expected):
            return "invalid signature"

    return None


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

    auth_error = _verify_request(request, body)
    if auth_error:
        logger.warning("rucaptcha_callback_unauthorized ip=%s reason=%s", client_ip, auth_error)
        return JSONResponse(status_code=403, content={"error": auth_error})

    logger.info("rucaptcha_callback_hit ip=%s body=%s", client_ip, body_str[:300])

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
