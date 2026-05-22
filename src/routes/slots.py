"""Shared slots coordination routes."""

from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.services import slots_group_service


class SlotsGroupClaimBody(BaseModel):
    group_key: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    meta: dict | None = None


class SlotsGroupPublishBody(BaseModel):
    group_key: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    slots_response: dict


class SlotsGroupWaitBody(BaseModel):
    group_key: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    wait_ms: int = slots_group_service.DEFAULT_WAIT_MS


class SlotsGroupFailBody(BaseModel):
    group_key: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    error: str = ""


def register_slots_routes(app):
    @app.post("/slots-group/claim")
    async def claim_slots_group(body: SlotsGroupClaimBody):
        return JSONResponse(
            content=slots_group_service.claim(
                body.group_key,
                body.client_id,
                body.meta,
            )
        )

    @app.post("/slots-group/publish")
    async def publish_slots_group(body: SlotsGroupPublishBody):
        result = slots_group_service.publish(
            body.group_key,
            body.client_id,
            body.slots_response,
        )
        status = 200 if result.get("ok", True) else 409
        return JSONResponse(status_code=status, content=result)

    @app.post("/slots-group/wait")
    async def wait_slots_group(body: SlotsGroupWaitBody):
        result = await slots_group_service.wait_for_slots(
            body.group_key,
            body.client_id,
            body.wait_ms,
        )
        return JSONResponse(content=result)

    @app.post("/slots-group/fail")
    async def fail_slots_group(body: SlotsGroupFailBody):
        result = slots_group_service.fail(
            body.group_key,
            body.client_id,
            body.error,
        )
        status = 200 if result.get("ok", True) else 409
        return JSONResponse(status_code=status, content=result)

    @app.get("/slots-group/stats")
    async def slots_group_stats():
        return JSONResponse(content=slots_group_service.stats())
