"""HTTP adapters for the anonymous channel plugin."""

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from src.policies.access_policy import token_from_request
from src.repositories import user_repo
from src.services import plugin_channel_service

router = APIRouter(tags=["plugin_channel"])
admin_router = APIRouter(prefix="/admin/plugin-channel", tags=["admin_plugin_channel"])


class OpenPluginChannelBody(BaseModel):
    installation_id: str
    extension_version: str = ""
    route_kind: str = "unknown"
    page_url: str = ""
    raw_snapshot: dict[str, Any] = {}
    transport_mode: str | None = None
    executor_token: str | None = None


class PluginChannelCommandBody(BaseModel):
    type: str
    payload: dict[str, Any] = {}


class PluginChannelCommandResultBody(BaseModel):
    channel_secret: str
    ok: bool = True
    result: dict[str, Any] = {}
    error: str | None = None


class AssignPluginChannelSessionBody(BaseModel):
    master_key_id: int


class PluginChannelSnapshotBody(BaseModel):
    channel_secret: str
    route_kind: str = "unknown"
    page_url: str = ""
    raw_snapshot: dict[str, Any] = {}
    executor_token: str | None = None


class PluginChannelEventBody(BaseModel):
    channel_secret: str
    type: str | None = None
    event_type: str | None = None
    message: str = ""
    payload: dict[str, Any] = {}


def _current_user_id(request: Request) -> int | None:
    user = user_repo.get_session_user(token_from_request(request))
    return user.id if user else None


@router.post("/plugin-channel/sessions/open")
async def open_plugin_channel(body: OpenPluginChannelBody):
    status, content = plugin_channel_service.open_session(body)
    return JSONResponse(status_code=status, content=content)


@router.get("/plugin-channel/sessions/{session_id}/commands")
async def poll_plugin_channel_commands(session_id: int, channel_secret: str):
    status, content = plugin_channel_service.poll_commands(session_id, channel_secret)
    return JSONResponse(status_code=status, content=content)


@router.get("/plugin-channel/sessions/{session_id}/commands/stream")
async def stream_plugin_channel_commands(session_id: int, channel_secret: str):
    async def event_stream():
        while True:
            status, content = plugin_channel_service.poll_commands(session_id, channel_secret)
            if status != 200:
                yield f"event: error\ndata: {json.dumps(content, ensure_ascii=False)}\n\n"
                break
            commands = content.get("commands") or []
            if commands:
                yield f"event: commands\ndata: {json.dumps({'commands': commands}, ensure_ascii=False)}\n\n"
            else:
                yield "event: heartbeat\ndata: {}\n\n"
            await asyncio.sleep(1.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/plugin-channel/sessions/{session_id}/snapshot")
async def refresh_plugin_channel_snapshot(session_id: int, body: PluginChannelSnapshotBody):
    status, content = plugin_channel_service.refresh_snapshot(session_id, body)
    return JSONResponse(status_code=status, content=content)


@router.post("/plugin-channel/sessions/{session_id}/commands/{command_id}/result")
async def complete_plugin_channel_command(
    session_id: int,
    command_id: int,
    body: PluginChannelCommandResultBody,
):
    status, content = plugin_channel_service.complete_command(session_id, command_id, body)
    return JSONResponse(status_code=status, content=content)


@router.post("/plugin-channel/sessions/{session_id}/events")
async def append_plugin_channel_event(session_id: int, body: PluginChannelEventBody):
    status, content = plugin_channel_service.append_event(session_id, body)
    return JSONResponse(status_code=status, content=content)


@admin_router.get("/sessions")
async def list_plugin_channel_sessions(request: Request):
    status, content = plugin_channel_service.list_sessions(_current_user_id(request))
    return JSONResponse(status_code=status, content=content)


@admin_router.post("/sessions/{session_id}/claim")
async def claim_plugin_channel_session(session_id: int, request: Request):
    status, content = plugin_channel_service.claim_session(session_id, _current_user_id(request))
    return JSONResponse(status_code=status, content=content)


@admin_router.post("/sessions/{session_id}/assign")
async def assign_plugin_channel_session(
    session_id: int,
    body: AssignPluginChannelSessionBody,
    request: Request,
):
    status, content = plugin_channel_service.assign_session_to_master_key(session_id, _current_user_id(request), body)
    return JSONResponse(status_code=status, content=content)


@admin_router.post("/sessions/{session_id}/release")
async def release_plugin_channel_session(session_id: int, request: Request):
    status, content = plugin_channel_service.release_session(session_id, _current_user_id(request))
    return JSONResponse(status_code=status, content=content)


@admin_router.post("/sessions/{session_id}/close")
async def close_plugin_channel_session(session_id: int, request: Request):
    status, content = plugin_channel_service.close_session(session_id, _current_user_id(request))
    return JSONResponse(status_code=status, content=content)


@admin_router.post("/sessions/{session_id}/commands")
async def enqueue_plugin_channel_command(
    session_id: int,
    body: PluginChannelCommandBody,
    request: Request,
):
    status, content = plugin_channel_service.enqueue_command(session_id, _current_user_id(request), body)
    return JSONResponse(status_code=status, content=content)
