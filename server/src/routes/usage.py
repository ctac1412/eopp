"""Usage routes.

HTTP-only adapter: validation models come from schemas, workflow rules live in
src.services.usage_service, persistence lives behind repositories.
"""

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from src.models import ConfirmUsageBody, FailUsageBody, RegisterUsageBody
from src.policies.access_policy import token_from_request
from src.services import usage_service

router = APIRouter(tags=["usage"])


@router.post("/register-usage")
async def register_usage(body: RegisterUsageBody):
    status, content = usage_service.register_usage(body)
    return JSONResponse(status_code=status, content=content)


@router.post("/confirm-usage")
async def handle_confirm_usage(body: ConfirmUsageBody):
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
    status, content = usage_service.list_usage(
        admin_token=token_from_request(request),
        api_key_id=api_key_id,
        api_key=api_key,
        hide_test=hide_test,
        invoice_id=invoice_id,
    )
    return JSONResponse(status_code=status, content=content)


@router.post("/fail-usage")
async def handle_fail_usage(body: FailUsageBody):
    status, content = usage_service.fail_usage(body)
    return JSONResponse(status_code=status, content=content)
