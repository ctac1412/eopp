"""Operator and operator-master link repository."""

import json as _json
import logging
import uuid as _uuid
from datetime import UTC, datetime

from src.entities import (
    ApiKey,
    Company,
    CompanyMembership,
    Operator,
    OperatorCompanyBillingOverride,
    OperatorMasterLink,
    OperatorProfile,
    User,
    get_session,
)

logger = logging.getLogger("eopp.operator_repo")

OPERATOR_BILLING_MODES = {"company", "custom", "free"}


def _normalize_company_ids(value, fallback_company_id: int | None) -> list[int]:
    if value is None:
        return [int(fallback_company_id)] if fallback_company_id is not None else []
    if not isinstance(value, list):
        value = [value]
    result: list[int] = []
    for raw in value:
        if raw is None or raw == "":
            continue
        cid = int(raw)
        if cid not in result:
            result.append(cid)
    if not result and fallback_company_id is not None:
        result.append(int(fallback_company_id))
    return result


def _profile_company_ids(profile: OperatorProfile | None, fallback_company_id: int | None) -> list[int]:
    if profile and profile.company_ids:
        try:
            return _normalize_company_ids(_json.loads(profile.company_ids), fallback_company_id)
        except (TypeError, ValueError):
            pass
    return _normalize_company_ids(None, fallback_company_id)


def _operator_access_scope(op: Operator) -> dict:
    """Return read-only operator company scope from user access assignments."""
    if not op.profile or op.profile.user_id is None:
        return {"all_companies": False, "company_ids": _profile_company_ids(op.profile, op.company_id)}
    from src.repositories import user_company_access_repo

    payload = user_company_access_repo.user_access_payload("operator", int(op.profile.user_id))
    company_ids = _normalize_company_ids(payload.get("company_ids"), op.company_id)
    return {
        "all_companies": payload.get("all_companies") is True,
        "company_ids": company_ids,
    }


def _operator_display_name(op: Operator) -> str:
    if op.profile and op.profile.user:
        return op.profile.user.name or op.profile.user.login or f"#{op.id}"
    return f"#{op.id}"


def _operator_to_dict(op: Operator, company_names: dict[int, str] | None = None) -> dict:
    company_ids = _profile_company_ids(op.profile, op.company_id)
    access_scope = _operator_access_scope(op)
    operator_company_ids = access_scope["company_ids"]
    names = company_names or {}
    data = {
        "id": op.id,
        "uuid": op.uuid,
        "nickname": _operator_display_name(op),
        "user_name": _operator_display_name(op),
        "created_at": op.created_at,
        "icon_display_mode": op.icon_display_mode,
        "icon_rate": int(getattr(op, "icon_rate", 0) or 0),
        "billing_mode": getattr(op, "billing_mode", None) or "company",
        "allowed_master_keys": (
            _json.loads(op.allowed_master_keys)
            if op.allowed_master_keys
            else None
        ),
        "online": op.online,
        "company_id": op.company_id,
        "company_ids": company_ids,
        "company_names": [names.get(company_id) for company_id in company_ids if names.get(company_id)],
        "operator_all_companies": access_scope["all_companies"],
        "operator_company_ids": operator_company_ids,
        "operator_company_names": [
            names.get(company_id) for company_id in operator_company_ids if names.get(company_id)
        ],
    }
    data["billing_overrides"] = _operator_billing_overrides(op.id, names)
    if op.profile:
        data["profile_id"] = op.profile.id
        data["user_id"] = op.profile.user_id
        data["profile_active"] = op.profile.active
    return data


def _operator_billing_overrides(operator_id: int, company_names: dict[int, str] | None = None) -> list[dict]:
    names = company_names or {}
    with get_session() as session:
        rows = (
            session.query(OperatorCompanyBillingOverride)
            .filter(OperatorCompanyBillingOverride.operator_id == operator_id)
            .order_by(OperatorCompanyBillingOverride.company_id.asc())
            .all()
        )
        return [
            {
                "company_id": row.company_id,
                "company_name": names.get(row.company_id),
                "billing_mode": row.billing_mode or "company",
                "icon_rate": int(row.icon_rate or 0),
            }
            for row in rows
        ]


def _normalize_billing_overrides(value) -> list[dict]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("billing_overrides must be a list")
    result: list[dict] = []
    seen: set[int] = set()
    for raw in value:
        if not isinstance(raw, dict):
            raise ValueError("billing_overrides entries must be objects")
        company_id = raw.get("company_id")
        if company_id in (None, ""):
            continue
        company_id = int(company_id)
        if company_id in seen:
            continue
        billing_mode = str(raw.get("billing_mode") or "company")
        if billing_mode not in OPERATOR_BILLING_MODES:
            raise ValueError("Invalid operator billing_mode")
        icon_rate = max(0, int(raw.get("icon_rate") or 0)) if billing_mode == "custom" else 0
        result.append(
            {
                "company_id": company_id,
                "billing_mode": billing_mode,
                "icon_rate": icon_rate,
            }
        )
        seen.add(company_id)
    return result


def _replace_billing_overrides(session, operator_id: int, overrides) -> None:
    normalized = _normalize_billing_overrides(overrides)
    if normalized:
        company_ids = [item["company_id"] for item in normalized]
        companies = session.query(Company.id).filter(Company.id.in_(company_ids)).all()
        existing = {int(row.id) for row in companies}
        missing = [company_id for company_id in company_ids if company_id not in existing]
        if missing:
            raise ValueError(f"company_not_found:{missing[0]}")
    session.query(OperatorCompanyBillingOverride).filter(
        OperatorCompanyBillingOverride.operator_id == operator_id
    ).delete()
    now = datetime.now(UTC).isoformat()
    for item in normalized:
        session.add(
            OperatorCompanyBillingOverride(
                operator_id=operator_id,
                company_id=item["company_id"],
                billing_mode=item["billing_mode"],
                icon_rate=item["icon_rate"],
                created_at=now,
                updated_at=now,
            )
        )


def create_operator(nickname: str, company_id: int | None = None) -> dict:
    with get_session() as session:
        now = datetime.now(UTC).isoformat()
        op = Operator(
            uuid=_uuid.uuid4().hex[:12],
            created_at=now,
            icon_rate=0,
            billing_mode="company",
            company_id=company_id,
        )
        session.add(op)
        session.flush()
        if company_id is not None:
            login = f"operator_{op.uuid}"
            user = User(
                name=nickname,
                login=login,
                password_hash=None,
                role="operator",
                system_role=None,
                active=True,
                company_id=int(company_id),
                created_at=now,
            )
            session.add(user)
            session.flush()
            session.add(
                CompanyMembership(
                    user_id=user.id,
                    company_id=int(company_id),
                    role="manager",
                    active=True,
                    created_at=now,
                )
            )
            profile = OperatorProfile(
                user_id=user.id,
                company_id=int(company_id),
                company_ids=_json.dumps([int(company_id)]),
                operator_id=op.id,
                active=True,
                created_at=now,
            )
            session.add(profile)
            op.profile = profile
        session.commit()
        session.refresh(op)
        if company_id is not None and op.profile:
            from src.repositories import user_company_access_repo

            user_company_access_repo.set_user_access(
                op.profile.user_id,
                {"operator": {"company_ids": [int(company_id)], "all_companies": False}},
            )
        return _operator_to_dict(op)


def list_operators(company_id: int | None = None, *, include_test_users: bool = True) -> list[dict]:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        ops = (
            session.query(Operator)
            .options(
                joinedload(Operator.company),
                joinedload(Operator.profile).joinedload(OperatorProfile.user),
            )
            .order_by(Operator.created_at.desc())
            .all()
        )
        all_company_ids: set[int] = set()
        for op in ops:
            all_company_ids.update(_profile_company_ids(op.profile, op.company_id))
            all_company_ids.update(_operator_access_scope(op)["company_ids"])
        op_ids = [op.id for op in ops]
        if op_ids:
            for row in (
                session.query(OperatorCompanyBillingOverride.company_id)
                .filter(OperatorCompanyBillingOverride.operator_id.in_(op_ids))
                .all()
            ):
                all_company_ids.add(int(row.company_id))
        company_names = {
            row.id: row.name
            for row in session.query(Company).filter(Company.id.in_(all_company_ids)).all()
        } if all_company_ids else {}
        rows = []
        for op in ops:
            if (
                not include_test_users
                and op.profile
                and op.profile.user
                and bool(getattr(op.profile.user, "is_test", False))
            ):
                continue
            op_company_ids = _profile_company_ids(op.profile, op.company_id)
            access_scope = _operator_access_scope(op)
            access_company_ids = access_scope["company_ids"]
            if (
                company_id is not None
                and not access_scope["all_companies"]
                and int(company_id) not in access_company_ids
            ):
                continue
            primary_company_name = op.company.name if op.company else None
            rows.append(
                {
                    **_operator_to_dict(op, company_names),
                    "company_name": primary_company_name or (company_names.get(op_company_ids[0]) if op_company_ids else None),
                }
            )
        return rows


def get_operator_by_uuid(uuid: str) -> dict | None:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        op = (
            session.query(Operator)
            .options(joinedload(Operator.profile).joinedload(OperatorProfile.user))
            .filter(Operator.uuid == uuid)
            .first()
        )
        if not op:
            return None
        return _operator_to_dict(op)


def get_operator_by_id(operator_id: int) -> dict | None:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        op = (
            session.query(Operator)
            .options(joinedload(Operator.profile).joinedload(OperatorProfile.user))
            .filter(Operator.id == operator_id)
            .first()
        )
        if not op:
            return None
        return _operator_to_dict(op)


def update_operator(operator_id: int, **kwargs) -> dict | None:
    with get_session() as session:
        op = session.get(Operator, operator_id)
        if not op:
            return None
        company_ids = kwargs.pop("company_ids", None)
        billing_overrides = kwargs.pop("billing_overrides", None)
        kwargs.pop("nickname", None)
        for attr, value in kwargs.items():
            if value is not None and hasattr(op, attr):
                setattr(op, attr, value)
        if company_ids is not None:
            normalized = _normalize_company_ids(company_ids, op.company_id)
            if op.profile:
                op.profile.company_ids = _json.dumps(normalized)
                if normalized:
                    op.profile.company_id = normalized[0]
                    op.company_id = normalized[0]
        if billing_overrides is not None:
            _replace_billing_overrides(session, operator_id, billing_overrides)
        session.commit()
        session.refresh(op)
        return _operator_to_dict(op)


def save_operator_assignments(assignments: list[dict]) -> list[dict]:
    """Persist operator company and master-key access combinations."""
    with get_session() as session:
        updated: list[Operator] = []
        for assignment in assignments:
            operator_id = int(assignment["operator_id"])
            op = session.get(Operator, operator_id)
            if not op:
                raise ValueError(f"operator_not_found:{operator_id}")
            company_ids = _normalize_company_ids(
                assignment.get("company_ids"),
                op.company_id,
            )
            master_key_ids = [
                int(raw)
                for raw in assignment.get("master_key_ids", [])
                if raw is not None and raw != ""
            ]
            keys = (
                session.query(ApiKey)
                .filter(ApiKey.id.in_(master_key_ids))
                .all()
                if master_key_ids
                else []
            )
            keys_by_id = {key.id: key for key in keys}
            missing = [key_id for key_id in master_key_ids if key_id not in keys_by_id]
            if missing:
                raise ValueError(f"master_key_not_found:{missing[0]}")
            allowed_companies = set(company_ids)
            for key in keys:
                if key.company_id is not None and int(key.company_id) not in allowed_companies:
                    raise PermissionError(f"master_key_out_of_company_scope:{key.id}")

            op.allowed_master_keys = _json.dumps(master_key_ids) if master_key_ids else None
            if company_ids:
                op.company_id = company_ids[0]
            if op.profile:
                op.profile.company_ids = _json.dumps(company_ids)
                if company_ids:
                    op.profile.company_id = company_ids[0]
            updated.append(op)

        session.commit()
        for op in updated:
            session.refresh(op)

        all_company_ids: set[int] = set()
        for op in updated:
            all_company_ids.update(_profile_company_ids(op.profile, op.company_id))
        company_names = {
            row.id: row.name
            for row in session.query(Company).filter(Company.id.in_(all_company_ids)).all()
        } if all_company_ids else {}
        return [
            {
                **_operator_to_dict(op, company_names),
                "company_name": op.company.name if op.company else None,
            }
            for op in updated
        ]


def operator_allows_company(operator_id: int, company_id: int | None) -> bool:
    if company_id is None:
        return True
    op = get_operator_by_id(operator_id)
    if not op:
        return False
    if op.get("operator_all_companies") is True:
        return True
    company_ids = op.get("operator_company_ids") or []
    return int(company_id) in [int(cid) for cid in company_ids]


def set_operator_online(operator_id: int, online: bool) -> None:
    with get_session() as session:
        op = session.get(Operator, operator_id)
        if not op:
            logger.warning("set_operator_online: operator %s not found", operator_id)
            return
        op.online = online
        session.commit()
        logger.info("operator_online op_id=%s online=%s", operator_id, online)


def delete_operator(operator_id: int) -> bool:
    with get_session() as session:
        op = session.get(Operator, operator_id)
        if not op:
            return False
        session.delete(op)
        session.commit()
        return True


def link_operator_to_master(operator_id: int, master_key_id: int) -> tuple[int, list[int]]:
    """Create or reactivate operator-master link. Multiple operators per master allowed.

    Returns (link_id, evicted_operator_ids) — evicted is always empty now.
    """
    with get_session() as session:
        session.query(OperatorMasterLink).filter(
            OperatorMasterLink.operator_id == operator_id,
            OperatorMasterLink.active == True,
        ).update({"active": False})

        existing = (
            session.query(OperatorMasterLink)
            .filter(
                OperatorMasterLink.operator_id == operator_id,
                OperatorMasterLink.master_key_id == master_key_id,
            )
            .first()
        )
        if existing:
            existing.active = True
            session.commit()
            return existing.id, []

        link = OperatorMasterLink(
            operator_id=operator_id,
            master_key_id=master_key_id,
            active=True,
            created_at=datetime.now(UTC).isoformat(),
        )
        session.add(link)
        session.flush()
        session.commit()
        return link.id, []


def unlink_operator(operator_id: int, master_key_id: int) -> bool:
    with get_session() as session:
        link = (
            session.query(OperatorMasterLink)
            .filter(
                OperatorMasterLink.operator_id == operator_id,
                OperatorMasterLink.master_key_id == master_key_id,
            )
            .first()
        )
        if not link:
            return False
        link.active = False
        session.commit()
        return True


def get_operator_masters(operator_id: int) -> list[int]:
    with get_session() as session:
        links = (
            session.query(OperatorMasterLink)
            .filter(
                OperatorMasterLink.operator_id == operator_id,
                OperatorMasterLink.active == True,
            )
            .all()
        )
        return [l.master_key_id for l in links]


def get_subscribed_operators(master_key_id: int) -> list[int]:
    """Return operator IDs subscribed to this master (online only)."""
    with get_session() as session:
        rows = (
            session.query(OperatorMasterLink.operator_id)
            .join(Operator, Operator.id == OperatorMasterLink.operator_id)
            .filter(
                OperatorMasterLink.master_key_id == master_key_id,
                OperatorMasterLink.active == True,
                Operator.online == True,
            )
            .all()
        )
        return [r.operator_id for r in rows]


def get_active_links(company_id: int | None = None, *, include_test_users: bool = True) -> list[dict]:
    """Return all active operator-master links with operator nickname and master label."""
    with get_session() as session:
        rows = (
            session.query(OperatorMasterLink, Operator, ApiKey)
            .join(Operator, Operator.id == OperatorMasterLink.operator_id)
            .join(ApiKey, ApiKey.id == OperatorMasterLink.master_key_id)
            .filter(OperatorMasterLink.active == True)
            .order_by(OperatorMasterLink.created_at.desc())
            .all()
        )
        result = []
        for link, op, key in rows:
            if not include_test_users:
                operator_is_test = bool(
                    op.profile
                    and op.profile.user
                    and getattr(op.profile.user, "is_test", False)
                )
                master_is_test = bool(
                    key.user
                    and getattr(key.user, "is_test", False)
                )
                if operator_is_test or master_is_test:
                    continue
            op_company_ids = _profile_company_ids(op.profile, op.company_id)
            if company_id is not None and int(company_id) not in op_company_ids:
                continue
            result.append(
                {
                    "link_id": link.id,
                    "operator_id": op.id,
                    "operator_nickname": _operator_display_name(op),
                    "operator_uuid": op.uuid,
                    "operator_online": op.online,
                    "master_key_id": key.id,
                    "master_label": key.label,
                    "created_at": link.created_at,
                }
            )
        return result
