from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from src.entities import (
    Operator,
    OperatorProfile,
    User,
    UserExecutorCompany,
    UserFinanceCompany,
    UserOperatorCompany,
    get_session,
)
from src.repositories import user_repo

AccessModel = type[UserFinanceCompany] | type[UserOperatorCompany] | type[UserExecutorCompany]

ACCESS_MODELS: dict[str, AccessModel] = {
    "finance": UserFinanceCompany,
    "operator": UserOperatorCompany,
    "executor": UserExecutorCompany,
}


def _normalize_payload(payload: dict | None) -> dict:
    payload = payload or {}
    company_ids = []
    for raw in payload.get("company_ids") or []:
        if raw is None or raw == "":
            continue
        cid = int(raw)
        if cid not in company_ids:
            company_ids.append(cid)
    return {
        "all_companies": payload.get("all_companies") is True,
        "company_ids": company_ids,
    }


def _rows_to_payload(rows) -> dict:
    return {
        "all_companies": any(row.company_id is None and row.active for row in rows),
        "company_ids": sorted(
            {
                int(row.company_id)
                for row in rows
                if row.active and row.company_id is not None
            }
        ),
    }


def _set_kind(session, user_id: int, kind: str, payload: dict) -> None:
    model = ACCESS_MODELS[kind]
    normalized = _normalize_payload(payload)
    now = datetime.now(UTC).isoformat()
    session.query(model).filter(model.user_id == user_id).delete()
    if normalized["all_companies"]:
        session.add(model(user_id=user_id, company_id=None, active=True, created_at=now))
    for company_id in normalized["company_ids"]:
        session.add(model(user_id=user_id, company_id=company_id, active=True, created_at=now))


def _primary_operator_company_id(user: User, payload: dict) -> int | None:
    company_ids = payload.get("company_ids") or []
    if company_ids:
        return int(company_ids[0])
    if user.company_id is not None:
        return int(user.company_id)
    for membership in getattr(user, "company_memberships", []):
        if membership.active:
            return int(membership.company_id)
    return None


def _ensure_operator_runtime(session, user: User, payload: dict) -> None:
    """Create the default operator runtime row when operator access is granted."""
    normalized = _normalize_payload(payload)
    if not normalized["all_companies"] and not normalized["company_ids"]:
        if user.operator_profile:
            user.operator_profile.active = False
            user.operator_profile.updated_at = datetime.now(UTC).isoformat()
        return

    company_id = _primary_operator_company_id(user, normalized)
    if company_id is None:
        return

    now = datetime.now(UTC).isoformat()
    company_ids = normalized["company_ids"] or [company_id]
    profile = user.operator_profile
    operator = profile.operator if profile else None
    if operator is None:
        import uuid as _uuid

        operator = Operator(
            uuid=_uuid.uuid4().hex[:12],
            nickname=user.name or user.login or "operator",
            created_at=now,
            company_id=company_id,
        )
        session.add(operator)
        session.flush()
    if profile:
        profile.company_id = company_id
        profile.company_ids = json.dumps(company_ids)
        profile.operator_id = operator.id
        profile.active = True
        profile.updated_at = now
    else:
        session.add(
            OperatorProfile(
                user_id=user.id,
                company_id=company_id,
                company_ids=json.dumps(company_ids),
                operator_id=operator.id,
                active=True,
                created_at=now,
            )
        )


def get_user_access(user_id: int) -> dict | None:
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return None
        return {
            kind: _rows_to_payload(
                session.query(model)
                .filter(model.user_id == user_id, model.active.is_(True))
                .all()
            )
            for kind, model in ACCESS_MODELS.items()
        }


def set_user_access(user_id: int, payload: dict) -> dict | None:
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return None
        for kind in ACCESS_MODELS:
            if kind in payload:
                _set_kind(session, user_id, kind, payload.get(kind) or {})
        if "operator" in payload:
            _ensure_operator_runtime(session, user, payload.get("operator") or {})
        session.commit()
    return get_user_access(user_id)


def get_company_access(company_id: int) -> dict:
    with get_session() as session:
        result = {}
        for kind, model in ACCESS_MODELS.items():
            rows = (
                session.query(model)
                .filter(
                    model.active.is_(True),
                    or_(model.company_id == company_id, model.company_id.is_(None)),
                )
                .all()
            )
            result[kind] = {
                "user_ids": sorted({row.user_id for row in rows if row.company_id == company_id}),
                "all_user_ids": sorted({row.user_id for row in rows if row.company_id is None}),
            }
        return result


def set_company_access(company_id: int, payload: dict) -> dict:
    with get_session() as session:
        now = datetime.now(UTC).isoformat()
        for kind, model in ACCESS_MODELS.items():
            key = f"{kind}_user_ids"
            if key not in payload:
                continue
            desired = {int(user_id) for user_id in payload.get(key) or []}
            current = (
                session.query(model)
                .filter(model.company_id == company_id)
                .all()
            )
            by_user = {row.user_id: row for row in current}
            for user_id, row in by_user.items():
                if user_id not in desired and row.active:
                    row.active = False
                    row.updated_at = now
            for user_id in desired:
                row = by_user.get(user_id)
                if row:
                    row.active = True
                    row.updated_at = now
                else:
                    session.add(model(user_id=user_id, company_id=company_id, active=True, created_at=now))
        session.commit()
    return get_company_access(company_id)


def user_has_company_access(kind: str, user_id: int, company_id: int | None) -> bool:
    if company_id is None:
        return False
    model = ACCESS_MODELS[kind]
    with get_session() as session:
        return (
            session.query(model)
            .filter(
                model.user_id == user_id,
                model.active.is_(True),
                or_(model.company_id == company_id, model.company_id.is_(None)),
            )
            .first()
            is not None
        )


def user_access_payload(kind: str, user_id: int) -> dict:
    model = ACCESS_MODELS[kind]
    with get_session() as session:
        rows = (
            session.query(model)
            .filter(model.user_id == user_id, model.active.is_(True))
            .all()
        )
        return _rows_to_payload(rows)


def list_finance_participants(company_id: int | None = None) -> list[dict]:
    with get_session() as session:
        query = (
            session.query(User)
            .join(UserFinanceCompany, UserFinanceCompany.user_id == User.id)
            .options(joinedload(User.company))
            .filter(User.active.is_(True), UserFinanceCompany.active.is_(True))
        )
        if company_id is not None:
            query = query.filter(
                or_(
                    UserFinanceCompany.company_id == company_id,
                    UserFinanceCompany.company_id.is_(None),
                )
            )
        users = query.order_by(User.name).distinct().all()
        return [user_repo.user_to_dict(user) for user in users]
