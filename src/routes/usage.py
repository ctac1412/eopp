"""Usage routes.

HTTP-only adapter: validation models come from schemas, workflow rules live in
src.services.usage_service, persistence lives behind repositories.
"""

from fastapi import Query, Request
from fastapi.responses import JSONResponse

from src.models import ConfirmUsageBody, FailUsageBody, RegisterUsageBody
from src.services import usage_service


def register_usage_routes(app):
    @app.post("/register-usage")
    async def register_usage(body: RegisterUsageBody):
        status, content = usage_service.register_usage(body)
        return JSONResponse(status_code=status, content=content)

    @app.post("/confirm-usage")
    async def handle_confirm_usage(body: ConfirmUsageBody):
        status, content = usage_service.confirm_usage(body)
        return JSONResponse(status_code=status, content=content)

    @app.delete("/usage-log/{usage_log_id}")
    async def delete_usage_log_entry(usage_log_id: int, request: Request):
        status, content = usage_service.delete_usage(
            usage_log_id,
            request.headers.get("X-Admin-Token"),
        )
        return JSONResponse(status_code=status, content=content)

    @app.get("/usage-log")
    async def get_usage_log(
        request: Request,
        api_key_id: int | None = Query(None),
        api_key: str | None = Query(None),
        hide_test: bool = Query(True),
    ):
        status, content = usage_service.list_usage(
            admin_token=request.headers.get("X-Admin-Token"),
            api_key_id=api_key_id,
            api_key=api_key,
            hide_test=hide_test,
        )
        return JSONResponse(status_code=status, content=content)

    @app.post("/fail-usage")
    async def handle_fail_usage(body: FailUsageBody):
        status, content = usage_service.fail_usage(body)
        return JSONResponse(status_code=status, content=content)
