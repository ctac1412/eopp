"""Usage routes.

HTTP-only adapter: validation models come from schemas, workflow rules live in
src.services.usage_service, persistence lives behind repositories.
"""

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from src.models import ConfirmUsageBody, FailUsageBody, RegisterUsageBody
from src.policies.access_policy import token_from_request
from src.modules.access.permissions import Permission
from src.modules.access.service import AccessService
from src.repositories import api_key_repo, user_repo
from src.services.session_api_key import key_for_session_request, with_session_api_key
from src.services import usage_service

router = APIRouter(tags=["usage"])


@router.post("/register-usage")
async def register_usage(body: RegisterUsageBody, request: Request):
    key_record, error = key_for_session_request(request)
    if error:
        return error
    if body.api_key:
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    body = with_session_api_key(body, key_record.key)
    status, content = usage_service.register_usage(body)
    return JSONResponse(status_code=status, content=content)


@router.post("/confirm-usage")
async def handle_confirm_usage(body: ConfirmUsageBody, request: Request):
    key_record, error = key_for_session_request(request, enforce_usage_limit=False)
    if error:
        return error
    if body.api_key:
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    body = with_session_api_key(body, key_record.key)
    status, content = usage_service.confirm_usage(body)
    return JSONResponse(status_code=status, content=content)


@router.delete("/usage-log/{usage_log_id}")
async def delete_usage_log_entry(usage_log_id: int, request: Request):
    status, content = usage_service.delete_usage(
        usage_log_id,
        token_from_request(request),
    )
    return JSONResponse(status_code=status, content=content)


@router.get("/usage-log")
async def get_usage_log(
    request: Request,
    api_key_id: int | None = Query(None),
    api_key: str | None = Query(None),
    invoice_id: int | None = Query(None),
    hide_test: bool = Query(True),
):
    token = token_from_request(request)
    user = user_repo.get_session_user(token)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if api_key:
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})

    decision = AccessService().authorize_token(token, Permission.BILLING_VIEW)
    if not decision.allowed:
        key_record = api_key_repo.get_active_key_for_user(user.id)
        if not key_record:
            return JSONResponse(status_code=403, content={"error": "No active API key"})
        api_key_id = key_record.id

    status, content = usage_service.list_usage(
        admin_token=token,
        api_key_id=api_key_id,
        api_key=None,
        hide_test=hide_test,
        invoice_id=invoice_id,
    )
    return JSONResponse(status_code=status, content=content)


@router.post("/fail-usage")
async def handle_fail_usage(body: FailUsageBody, request: Request):
    key_record, error = key_for_session_request(request, enforce_usage_limit=False)
    if error:
        return error
    if body.api_key:
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    body = with_session_api_key(body, key_record.key)
    status, content = usage_service.fail_usage(body)
    return JSONResponse(status_code=status, content=content)
