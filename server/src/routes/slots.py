"""Shared slots coordination routes."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.services import slots_group_service

router = APIRouter(prefix="/slots-group", tags=["slots"])


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


@router.post("/claim")
async def claim_slots_group(body: SlotsGroupClaimBody):
    return JSONResponse(
        content=slots_group_service.claim(
            body.group_key,
            body.client_id,
            body.meta,
        )
    )


@router.post("/publish")
async def publish_slots_group(body: SlotsGroupPublishBody):
    result = slots_group_service.publish(
        body.group_key,
        body.client_id,
        body.slots_response,
    )
    status = 200 if result.get("ok", True) else 409
    return JSONResponse(status_code=status, content=result)


@router.post("/wait")
async def wait_slots_group(body: SlotsGroupWaitBody):
    result = await slots_group_service.wait_for_slots(
        body.group_key,
        body.client_id,
        body.wait_ms,
    )
    return JSONResponse(content=result)


@router.post("/fail")
async def fail_slots_group(body: SlotsGroupFailBody):
    result = slots_group_service.fail(
        body.group_key,
        body.client_id,
        body.error,
    )
    status = 200 if result.get("ok", True) else 409
    return JSONResponse(status_code=status, content=result)


@router.post("/heartbeat")
async def slots_group_heartbeat(body: SlotsGroupClaimBody):
    result = slots_group_service.heartbeat(body.group_key, body.client_id)
    status = 200 if result.get("ok", True) else 409
    return JSONResponse(status_code=status, content=result)


@router.get("/stats")
async def slots_group_stats():
    return JSONResponse(content=slots_group_service.stats())
