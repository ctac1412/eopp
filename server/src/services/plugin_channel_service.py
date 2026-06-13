"""Backend analysis and command registry for the thin channel plugin."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from src.repositories import company_repo, plugin_channel_repo

ROUTE_KINDS = {"reservation_card", "eopp_root", "unknown"}


@dataclass(frozen=True)
class CommandSpec:
    type: str
    timeout_seconds: int
    requires_claim: bool
    allowed_session_states: tuple[str, ...]


COMMAND_REGISTRY: dict[str, CommandSpec] = {
    "refresh_snapshot": CommandSpec("refresh_snapshot", 15, True, ("claimed", "open")),
    "navigate_to_reservation": CommandSpec("navigate_to_reservation", 30, True, ("claimed",)),
    "apply_config": CommandSpec("apply_config", 15, True, ("claimed",)),
    "start_pipeline": CommandSpec("start_pipeline", 300, True, ("claimed",)),
    "stop_pipeline": CommandSpec("stop_pipeline", 15, True, ("claimed", "running")),
    "close_channel": CommandSpec("close_channel", 10, True, ("claimed", "open", "running")),
}


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text or None


def _get_path(data: Any, *path: str) -> Any:
    current = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _find_company_name(raw_snapshot: dict[str, Any]) -> str | None:
    candidates = [
        _get_path(raw_snapshot, "reservation", "userData", "organizationName"),
        _get_path(raw_snapshot, "reservationRaw", "userData", "organizationName"),
        _get_path(raw_snapshot, "user", "company"),
        _get_path(raw_snapshot, "company", "name"),
        raw_snapshot.get("companyName"),
    ]
    for candidate in candidates:
        cleaned = _clean(candidate)
        if cleaned:
            return cleaned

    visible_text = _clean(_get_path(raw_snapshot, "dom", "visibleText") or _get_path(raw_snapshot, "dom", "visible_text"))
    if visible_text:
        match = re.search(r"(?:Company|Компания|Организация)\s*[:\-]\s*([^\n\r]+)", visible_text, re.I)
        if match:
            return _clean(match.group(1))
    return None


def _find_eopp_user(raw_snapshot: dict[str, Any]) -> str | None:
    candidates = [
        _get_path(raw_snapshot, "reservation", "userData", "fio"),
        _get_path(raw_snapshot, "reservationRaw", "userData", "fio"),
        _get_path(raw_snapshot, "user", "name"),
        raw_snapshot.get("eoppUser"),
        raw_snapshot.get("eopp_user_hint"),
    ]
    for candidate in candidates:
        cleaned = _clean(candidate)
        if cleaned:
            return cleaned
    return None


def _find_executor_token(raw_snapshot: dict[str, Any], explicit_token: str | None = None) -> str | None:
    candidates = [
        explicit_token,
        raw_snapshot.get("executor_token"),
        raw_snapshot.get("executorToken"),
        _get_path(raw_snapshot, "executor", "token"),
    ]
    for candidate in candidates:
        cleaned = _clean(candidate)
        if cleaned:
            return cleaned
    return None


def _find_reservation_id(raw_snapshot: dict[str, Any], page_url: str, route_kind: str) -> str | None:
    candidates = [
        _get_path(raw_snapshot, "reservation", "id"),
        _get_path(raw_snapshot, "reservationRaw", "id"),
        raw_snapshot.get("reservationId"),
    ]
    for candidate in candidates:
        cleaned = _clean(candidate)
        if cleaned:
            return cleaned
    if route_kind == "reservation_card":
        match = re.search(r"/reservation/([^/]+)/", page_url)
        if match:
            return _clean(match.group(1))
    return None


def _resolve_company(company_name: str | None):
    if not company_name:
        return None, False
    existing = company_repo.find_company_by_name_or_alias(company_name)
    if existing:
        return existing, False
    return company_repo.create_company(
        name=company_name,
        aliases=[company_name],
        notes="source:eopp_channel_auto",
    ), True


def open_session(body) -> tuple[int, dict]:
    route_kind = body.route_kind if body.route_kind in ROUTE_KINDS else "unknown"
    raw_snapshot = body.raw_snapshot or {}
    company_name = _find_company_name(raw_snapshot)
    eopp_user_name = _find_eopp_user(raw_snapshot)
    executor_token = _find_executor_token(raw_snapshot, body.executor_token)
    reservation_id = _find_reservation_id(raw_snapshot, body.page_url, route_kind)
    company, auto_created = _resolve_company(company_name)
    visibility = "global_masters" if auto_created or company is None else "company_masters"

    plugin = plugin_channel_repo.upsert_connected_plugin(
        body.installation_id,
        body.extension_version,
        transport_mode=body.transport_mode,
    )
    parsed_fields = {
        "company_name": company_name,
        "company_auto_created": auto_created,
        "eopp_user_name": eopp_user_name,
        "executor_token": executor_token,
        "reservation_id": reservation_id,
        "route_kind": route_kind,
    }
    session_data = plugin_channel_repo.create_session(
        connected_plugin_id=plugin.id,
        route_kind=route_kind,
        page_url=body.page_url,
        company=company,
        raw_company_name=company_name,
        eopp_user_name=eopp_user_name,
        executor_token=executor_token,
        reservation_id=reservation_id,
        visibility=visibility,
        raw_snapshot=raw_snapshot,
        parsed_fields=parsed_fields,
    )
    company_payload = session_data.get("company")
    if company_payload:
        company_payload["auto_created"] = auto_created
    return 200, {
        "session_id": session_data["session_id"],
        "channel_secret": session_data["channel_secret"],
        "transport_mode": body.transport_mode or "pageDirect",
        "route_kind": route_kind,
        "reservation_id": reservation_id,
        "company": company_payload,
        "eopp_user": {"name": eopp_user_name} if eopp_user_name else None,
        "executor_token": executor_token,
        "visibility": visibility,
        "status": session_data["status"],
    }


def refresh_snapshot(session_id: int, body) -> tuple[int, dict]:
    route_kind = body.route_kind if body.route_kind in ROUTE_KINDS else "unknown"
    raw_snapshot = body.raw_snapshot or {}
    page_url = body.page_url or _get_path(raw_snapshot, "page", "url") or ""
    company_name = _find_company_name(raw_snapshot)
    eopp_user_name = _find_eopp_user(raw_snapshot)
    executor_token = _find_executor_token(raw_snapshot, body.executor_token)
    reservation_id = _find_reservation_id(raw_snapshot, page_url, route_kind)
    company, auto_created = _resolve_company(company_name)
    visibility = "global_masters" if auto_created or company is None else "company_masters"
    parsed_fields = {
        "company_name": company_name,
        "company_auto_created": auto_created,
        "eopp_user_name": eopp_user_name,
        "executor_token": executor_token,
        "reservation_id": reservation_id,
        "route_kind": route_kind,
    }
    session_data = plugin_channel_repo.refresh_session_snapshot(
        session_id,
        body.channel_secret,
        route_kind=route_kind,
        page_url=page_url,
        company=company,
        raw_company_name=company_name,
        eopp_user_name=eopp_user_name,
        executor_token=executor_token,
        reservation_id=reservation_id,
        visibility=visibility,
        raw_snapshot=raw_snapshot,
        parsed_fields=parsed_fields,
    )
    if not session_data:
        return 404, {"error": "session_not_found"}
    company_payload = session_data.get("company")
    if company_payload:
        company_payload["auto_created"] = auto_created
    return 200, {"session": session_data}


def list_sessions(user_id: int | None) -> tuple[int, dict]:
    if user_id is None:
        return 401, {"error": "Unauthorized"}
    return 200, {"sessions": plugin_channel_repo.visible_sessions_for_user(user_id)}


def claim_session(session_id: int, user_id: int | None) -> tuple[int, dict]:
    if user_id is None:
        return 401, {"error": "Unauthorized"}
    claimed = plugin_channel_repo.claim_session(session_id, user_id)
    if not claimed:
        return 404, {"error": "session_not_found"}
    return 200, {"session": claimed}


def assign_session_to_master_key(session_id: int, user_id: int | None, body) -> tuple[int, dict]:
    if user_id is None:
        return 401, {"error": "Unauthorized"}
    status, assigned = plugin_channel_repo.assign_session_to_master_key(session_id, user_id, body.master_key_id)
    if status == "not_found":
        return 404, {"error": "session_not_found"}
    if status == "forbidden":
        return 403, {"error": "master_key_not_allowed_for_channel"}
    return 200, {"session": assigned}


def release_session(session_id: int, user_id: int | None) -> tuple[int, dict]:
    if user_id is None:
        return 401, {"error": "Unauthorized"}
    released = plugin_channel_repo.release_session(session_id, user_id)
    if not released:
        return 404, {"error": "session_not_found"}
    return 200, {"session": released}


def close_session(session_id: int, user_id: int | None) -> tuple[int, dict]:
    if user_id is None:
        return 401, {"error": "Unauthorized"}
    closed = plugin_channel_repo.close_session(session_id, user_id)
    if not closed:
        return 404, {"error": "session_not_found"}
    return 200, {"session": closed}


def enqueue_command(session_id: int, user_id: int | None, body) -> tuple[int, dict]:
    if user_id is None:
        return 401, {"error": "Unauthorized"}
    command_type = body.type
    if command_type not in COMMAND_REGISTRY:
        return 400, {"error": "unknown_command"}
    spec = COMMAND_REGISTRY[command_type]
    command = plugin_channel_repo.create_command(
        session_id,
        user_id,
        command_type,
        body.payload or {},
        allowed_session_states=spec.allowed_session_states,
    )
    if not command:
        return 403, {"error": "session_not_claimed_or_state_not_allowed"}
    return 200, {
        "command": command | {
            "timeout_seconds": spec.timeout_seconds,
            "requires_claim": spec.requires_claim,
            "allowed_session_states": list(spec.allowed_session_states),
        }
    }


def poll_commands(session_id: int, channel_secret: str) -> tuple[int, dict]:
    commands = plugin_channel_repo.queued_commands_for_plugin(session_id, channel_secret)
    if commands is None:
        return 404, {"error": "session_not_found"}
    for command in commands:
        spec = COMMAND_REGISTRY.get(command["type"])
        if spec:
            command["timeout_seconds"] = spec.timeout_seconds
            command["requires_claim"] = spec.requires_claim
            command["allowed_session_states"] = list(spec.allowed_session_states)
    return 200, {"commands": commands}


def complete_command(session_id: int, command_id: int, body) -> tuple[int, dict]:
    ok = plugin_channel_repo.complete_command(
        session_id,
        body.channel_secret,
        command_id,
        ok=body.ok,
        result=body.result,
        error=body.error,
    )
    if not ok:
        return 404, {"error": "command_not_found"}
    return 200, {"ok": True}


def append_event(session_id: int, body) -> tuple[int, dict]:
    ok = plugin_channel_repo.append_event(
        session_id,
        body.channel_secret,
        getattr(body, "event_type", None) or getattr(body, "type", "event"),
        getattr(body, "message", ""),
        body.payload,
    )
    if not ok:
        return 404, {"error": "session_not_found"}
    return 200, {"ok": True}
