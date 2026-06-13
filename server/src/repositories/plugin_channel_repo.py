"""Persistence helpers for anonymous channel plugin sessions."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from typing import Any

from src.entities import (
    ApiKey,
    Company,
    ConnectedPlugin,
    PluginChannelCommand,
    PluginChannelEvent,
    PluginChannelSession,
    PluginChannelSnapshot,
    User,
    get_session,
)
from src.repositories import user_company_access_repo


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _company_dict(company: Company | None, *, auto_created: bool = False) -> dict | None:
    if company is None:
        return None
    return {
        "id": company.id,
        "name": company.name,
        "aliases": json.loads(company.aliases) if company.aliases else None,
        "auto_created": auto_created or "eopp_channel_auto" in (company.notes or ""),
    }


def _session_dict(row: PluginChannelSession, company: Company | None = None) -> dict:
    return {
        "id": row.id,
        "session_id": row.id,
        "route_kind": row.route_kind,
        "page_url": row.page_url,
        "company_id": row.company_id,
        "company": _company_dict(company),
        "raw_company_name": row.raw_company_name,
        "eopp_user": {"name": row.eopp_user_name} if row.eopp_user_name else None,
        "executor_token": row.executor_token,
        "reservation_id": row.reservation_id,
        "status": row.status,
        "visibility": row.visibility,
        "claimed_by_user_id": row.claimed_by_user_id,
        "claimed_master_key_id": row.claimed_master_key_id,
        "opened_at": row.opened_at,
        "last_seen_at": row.last_seen_at,
        "closed_at": row.closed_at,
    }


def upsert_connected_plugin(
    installation_id: str,
    extension_version: str,
    *,
    transport_mode: str | None = None,
) -> ConnectedPlugin:
    now = _now()
    with get_session() as session:
        plugin = (
            session.query(ConnectedPlugin)
            .filter(ConnectedPlugin.installation_id == installation_id)
            .first()
        )
        if plugin:
            plugin.extension_version = extension_version
            plugin.transport_mode = transport_mode or plugin.transport_mode
            plugin.last_seen_at = now
        else:
            plugin = ConnectedPlugin(
                installation_id=installation_id,
                extension_kind="channel",
                extension_version=extension_version,
                transport_mode=transport_mode,
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(plugin)
        session.commit()
        session.refresh(plugin)
        return plugin


def create_session(
    *,
    connected_plugin_id: int,
    route_kind: str,
    page_url: str,
    company: Company | None,
    raw_company_name: str | None,
    eopp_user_name: str | None,
    executor_token: str | None,
    reservation_id: str | None,
    visibility: str,
    raw_snapshot: dict[str, Any],
    parsed_fields: dict[str, Any],
) -> dict:
    now = _now()
    with get_session() as session:
        row = PluginChannelSession(
            connected_plugin_id=connected_plugin_id,
            route_kind=route_kind,
            page_url=page_url,
            company_id=company.id if company else None,
            raw_company_name=raw_company_name,
            eopp_user_name=eopp_user_name,
            executor_token=executor_token,
            reservation_id=reservation_id,
            status="open",
            visibility=visibility,
            channel_secret=secrets.token_urlsafe(32),
            opened_at=now,
            last_seen_at=now,
        )
        session.add(row)
        session.flush()
        session.add(
            PluginChannelSnapshot(
                session_id=row.id,
                raw_snapshot_json=json.dumps(raw_snapshot, ensure_ascii=False),
                parsed_fields_json=json.dumps(parsed_fields, ensure_ascii=False),
                parser_version="v1",
                created_at=now,
            )
        )
        session.add(
            PluginChannelEvent(
                session_id=row.id,
                type="session.opened",
                message="Channel opened",
                payload_json=json.dumps(parsed_fields, ensure_ascii=False),
                created_at=now,
            )
        )
        session.commit()
        session.refresh(row)
        return _session_dict(row, company) | {"channel_secret": row.channel_secret}


def refresh_session_snapshot(
    session_id: int,
    channel_secret: str,
    *,
    route_kind: str,
    page_url: str,
    company: Company | None,
    raw_company_name: str | None,
    eopp_user_name: str | None,
    executor_token: str | None,
    reservation_id: str | None,
    visibility: str,
    raw_snapshot: dict[str, Any],
    parsed_fields: dict[str, Any],
) -> dict | None:
    now = _now()
    with get_session() as session:
        row = (
            session.query(PluginChannelSession)
            .filter(
                PluginChannelSession.id == session_id,
                PluginChannelSession.channel_secret == channel_secret,
                PluginChannelSession.status != "closed",
            )
            .first()
        )
        if not row:
            return None
        row.route_kind = route_kind
        row.page_url = page_url or row.page_url
        row.company_id = company.id if company else None
        row.raw_company_name = raw_company_name
        row.eopp_user_name = eopp_user_name
        row.executor_token = executor_token
        row.reservation_id = reservation_id
        row.visibility = visibility
        row.last_seen_at = now
        session.add(
            PluginChannelSnapshot(
                session_id=row.id,
                raw_snapshot_json=json.dumps(raw_snapshot, ensure_ascii=False),
                parsed_fields_json=json.dumps(parsed_fields, ensure_ascii=False),
                parser_version="v1",
                created_at=now,
            )
        )
        session.add(
            PluginChannelEvent(
                session_id=row.id,
                type="session.snapshot_refreshed",
                message="Snapshot refreshed",
                payload_json=json.dumps(parsed_fields, ensure_ascii=False),
                created_at=now,
            )
        )
        session.commit()
        session.refresh(row)
        return _session_dict(row, company)


def visible_sessions_for_user(user_id: int) -> list[dict]:
    executor_access = user_company_access_repo.user_access_payload("executor", user_id)
    if not executor_access["all_companies"] and not executor_access["company_ids"]:
        return []
    with get_session() as session:
        query = (
            session.query(PluginChannelSession, Company)
            .outerjoin(Company, Company.id == PluginChannelSession.company_id)
            .filter(PluginChannelSession.status != "closed")
            .order_by(PluginChannelSession.opened_at.desc())
        )
        if not executor_access["all_companies"]:
            query = query.filter(
                PluginChannelSession.visibility == "company_masters",
                PluginChannelSession.company_id.in_([int(cid) for cid in executor_access["company_ids"]]),
            )
        rows = query.all()
        return [_session_dict(session_row, company) for session_row, company in rows]


def get_visible_session(session_id: int, user_id: int) -> PluginChannelSession | None:
    visible_ids = {row["id"] for row in visible_sessions_for_user(user_id)}
    if session_id not in visible_ids:
        return None
    with get_session() as session:
        row = session.get(PluginChannelSession, session_id)
        if row:
            session.expunge(row)
        return row


def claim_session(session_id: int, user_id: int) -> dict | None:
    if not get_visible_session(session_id, user_id):
        return None
    now = _now()
    with get_session() as session:
        row = session.get(PluginChannelSession, session_id)
        if not row or row.status == "closed":
            return None
        row.claimed_by_user_id = user_id
        row.claimed_master_key_id = None
        row.status = "claimed"
        row.last_seen_at = now
        session.add(
            PluginChannelEvent(
                session_id=session_id,
                type="session.claimed",
                message="Channel claimed",
                payload_json=json.dumps({"user_id": user_id}),
                created_at=now,
            )
        )
        company = session.get(Company, row.company_id) if row.company_id else None
        session.commit()
        session.refresh(row)
        return _session_dict(row, company)


def _master_key_can_claim(session_row: PluginChannelSession, key: ApiKey) -> bool:
    if key.is_external or not key.active or key.user_id is None:
        return False
    executor_access = user_company_access_repo.user_access_payload("executor", key.user_id)
    if executor_access["all_companies"]:
        return True
    return (
        session_row.visibility == "company_masters"
        and session_row.company_id is not None
        and int(session_row.company_id) in {int(cid) for cid in executor_access["company_ids"]}
    )


def assign_session_to_master_key(session_id: int, user_id: int, master_key_id: int) -> tuple[str, dict | None]:
    if not get_visible_session(session_id, user_id):
        return "not_found", None
    now = _now()
    with get_session() as session:
        row = session.get(PluginChannelSession, session_id)
        key = session.get(ApiKey, master_key_id)
        if not row or row.status == "closed":
            return "not_found", None
        if not key or not _master_key_can_claim(row, key):
            return "forbidden", None
        row.claimed_master_key_id = key.id
        row.claimed_by_user_id = key.user_id
        row.status = "claimed"
        row.last_seen_at = now
        session.add(
            PluginChannelEvent(
                session_id=session_id,
                type="session.assigned_to_master_key",
                message="Channel assigned to master key",
                payload_json=json.dumps({"user_id": user_id, "master_key_id": key.id}, ensure_ascii=False),
                created_at=now,
            )
        )
        company = session.get(Company, row.company_id) if row.company_id else None
        session.commit()
        session.refresh(row)
        return "ok", _session_dict(row, company)


def release_session(session_id: int, user_id: int) -> dict | None:
    if not get_visible_session(session_id, user_id):
        return None
    now = _now()
    with get_session() as session:
        row = session.get(PluginChannelSession, session_id)
        if not row or row.status == "closed":
            return None
        row.claimed_by_user_id = None
        row.claimed_master_key_id = None
        row.status = "open"
        row.last_seen_at = now
        session.add(
            PluginChannelEvent(
                session_id=session_id,
                type="session.released",
                message="Channel released",
                payload_json=json.dumps({"user_id": user_id}, ensure_ascii=False),
                created_at=now,
            )
        )
        company = session.get(Company, row.company_id) if row.company_id else None
        session.commit()
        session.refresh(row)
        return _session_dict(row, company)


def close_session(session_id: int, user_id: int) -> dict | None:
    if not get_visible_session(session_id, user_id):
        return None
    now = _now()
    with get_session() as session:
        row = session.get(PluginChannelSession, session_id)
        if not row:
            return None
        row.status = "closed"
        row.closed_at = now
        row.last_seen_at = now
        session.add(
            PluginChannelEvent(
                session_id=session_id,
                type="session.closed_by_admin",
                message="Channel closed by admin",
                payload_json=json.dumps({"user_id": user_id}),
                created_at=now,
            )
        )
        company = session.get(Company, row.company_id) if row.company_id else None
        session.commit()
        session.refresh(row)
        return _session_dict(row, company)


def create_command(
    session_id: int,
    user_id: int,
    command_type: str,
    payload: dict[str, Any],
    *,
    allowed_session_states: tuple[str, ...],
) -> dict | None:
    row = get_visible_session(session_id, user_id)
    if (
        not row
        or row.status == "closed"
        or row.claimed_by_user_id != user_id
        or row.status not in allowed_session_states
    ):
        return None
    now = _now()
    with get_session() as session:
        command = PluginChannelCommand(
            session_id=session_id,
            type=command_type,
            schema_version=1,
            payload_json=json.dumps(payload or {}, ensure_ascii=False),
            status="queued",
            created_by_user_id=user_id,
            created_at=now,
        )
        session.add(command)
        session.add(
            PluginChannelEvent(
                session_id=session_id,
                type="command.queued",
                message=command_type,
                payload_json=json.dumps({"user_id": user_id, "type": command_type}, ensure_ascii=False),
                created_at=now,
            )
        )
        session.commit()
        session.refresh(command)
        return {
            "id": command.id,
            "session_id": command.session_id,
            "type": command.type,
            "schema_version": command.schema_version,
            "payload": payload or {},
            "status": command.status,
        }


def _session_by_secret(session_id: int, channel_secret: str) -> PluginChannelSession | None:
    with get_session() as session:
        row = (
            session.query(PluginChannelSession)
            .filter(
                PluginChannelSession.id == session_id,
                PluginChannelSession.channel_secret == channel_secret,
                PluginChannelSession.status != "closed",
            )
            .first()
        )
        if row:
            session.expunge(row)
        return row


def queued_commands_for_plugin(session_id: int, channel_secret: str) -> list[dict] | None:
    if not _session_by_secret(session_id, channel_secret):
        return None
    now = _now()
    with get_session() as session:
        rows = (
            session.query(PluginChannelCommand)
            .filter(
                PluginChannelCommand.session_id == session_id,
                PluginChannelCommand.status == "queued",
            )
            .order_by(PluginChannelCommand.created_at.asc())
            .all()
        )
        result = []
        for row in rows:
            row.status = "dispatched"
            row.updated_at = now
            result.append(
                {
                    "id": row.id,
                    "session_id": row.session_id,
                    "type": row.type,
                    "schema_version": row.schema_version,
                    "payload": json.loads(row.payload_json or "{}"),
                    "status": "dispatched",
                }
            )
        session.commit()
        return result


def complete_command(
    session_id: int,
    channel_secret: str,
    command_id: int,
    *,
    ok: bool,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> bool:
    if not _session_by_secret(session_id, channel_secret):
        return False
    now = _now()
    with get_session() as session:
        command = (
            session.query(PluginChannelCommand)
            .filter(
                PluginChannelCommand.id == command_id,
                PluginChannelCommand.session_id == session_id,
            )
            .first()
        )
        if not command:
            return False
        command.status = "done" if ok else "failed"
        command.result_json = json.dumps(result or {}, ensure_ascii=False)
        command.error = error
        command.updated_at = now
        session.add(
            PluginChannelEvent(
                session_id=session_id,
                type="command.done" if ok else "command.failed",
                message=command.type,
                payload_json=json.dumps({"command_id": command_id, "error": error}, ensure_ascii=False),
                created_at=now,
            )
        )
        session.commit()
        return True


def append_event(
    session_id: int,
    channel_secret: str,
    event_type: str,
    message: str = "",
    payload: dict[str, Any] | None = None,
) -> bool:
    if not _session_by_secret(session_id, channel_secret):
        return False
    with get_session() as session:
        row = session.get(PluginChannelSession, session_id)
        if row:
            row.last_seen_at = _now()
        session.add(
            PluginChannelEvent(
                session_id=session_id,
                type=event_type,
                message=message,
                payload_json=json.dumps(payload or {}, ensure_ascii=False),
                created_at=_now(),
            )
        )
        session.commit()
        return True
