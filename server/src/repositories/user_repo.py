import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta

from src.entities import (
    AdminSession,
    CompanyMembership,
    FinanceParticipantProfile,
    MasterProfile,
    Operator,
    OperatorProfile,
    User,
    get_session,
)
from src.modules.access.permissions import ROLE_PERMISSIONS

PASSWORD_ITERATIONS = 120_000
SESSION_TTL_HOURS = 24 * 7
UNSET = object()
COMPANY_ROLES = {"administrator", "manager"}


def hash_password(password: str, *, salt: str | None = None) -> str:
    """Hash a user password with a stable stdlib PBKDF2 format."""
    salt_value = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_value.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt_value}${digest}"


def verify_password(password: str, password_hash: str | None) -> bool:
    """Return whether ``password`` matches a stored PBKDF2 hash."""
    if not password_hash:
        return False
    try:
        algorithm, iterations_raw, salt, expected = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations_raw),
        ).hex()
    except (TypeError, ValueError):
        return False
    return hmac.compare_digest(digest, expected)


def _membership_to_dict(membership: CompanyMembership) -> dict:
    return {
        "company_id": membership.company_id,
        "company_name": membership.company.name if membership.company else None,
        "role": membership.role,
        "active": membership.active,
    }


def _master_profile_to_dict(profile: MasterProfile | None) -> dict | None:
    if not profile:
        return None
    return {
        "id": profile.id,
        "company_id": profile.company_id,
        "company_name": profile.company.name if profile.company else None,
        "scope": profile.scope,
        "active": profile.active,
    }


def _operator_profile_to_dict(profile: OperatorProfile | None) -> dict | None:
    if not profile:
        return None
    operator = profile.operator
    company_ids = _operator_profile_company_ids(profile)
    return {
        "id": profile.id,
        "company_id": profile.company_id,
        "company_name": profile.company.name if profile.company else None,
        "company_ids": company_ids,
        "operator_id": profile.operator_id,
        "uuid": operator.uuid if operator else None,
        "nickname": operator.nickname if operator else None,
        "active": profile.active,
    }


def _finance_profile_to_dict(profile: FinanceParticipantProfile | None) -> dict | None:
    if not profile:
        return None
    return {
        "id": profile.id,
        "company_id": profile.company_id,
        "company_name": profile.company.name if profile.company else None,
        "active": profile.active,
    }


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "login": user.login,
        "role": user.role,
        "system_role": user.system_role,
        "active": user.active,
        "company_id": user.company_id,
        "company_name": user.company.name if user.company else None,
        "created_at": user.created_at,
        "company_memberships": [
            _membership_to_dict(membership)
            for membership in getattr(user, "company_memberships", [])
            if membership.active
        ],
        "master_profile": _master_profile_to_dict(getattr(user, "master_profile", None)),
        "operator_profile": _operator_profile_to_dict(getattr(user, "operator_profile", None)),
        "finance_profile": _finance_profile_to_dict(getattr(user, "finance_profile", None)),
    }


def list_users(company_id: int | None = None) -> list[dict]:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        query = (
            session.query(User)
            .options(
                joinedload(User.company),
                joinedload(User.company_memberships).joinedload(CompanyMembership.company),
                joinedload(User.master_profile).joinedload(MasterProfile.company),
                joinedload(User.operator_profile).joinedload(OperatorProfile.company),
                joinedload(User.operator_profile).joinedload(OperatorProfile.operator),
                joinedload(User.finance_profile).joinedload(FinanceParticipantProfile.company),
            )
        )
        if company_id is not None:
            query = query.filter(User.company_id == company_id)
        users = query.order_by(User.name).all()
        return [user_to_dict(user) for user in users]


def get_user(user_id: int) -> dict | None:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        user = (
            session.query(User)
            .options(
                joinedload(User.company),
                joinedload(User.company_memberships).joinedload(CompanyMembership.company),
                joinedload(User.master_profile).joinedload(MasterProfile.company),
                joinedload(User.operator_profile).joinedload(OperatorProfile.company),
                joinedload(User.operator_profile).joinedload(OperatorProfile.operator),
                joinedload(User.finance_profile).joinedload(FinanceParticipantProfile.company),
            )
            .filter(User.id == user_id)
            .first()
        )
        return user_to_dict(user) if user else None


def _profile_company_id(profile: dict | None, fallback_company_id: int | None) -> int | None:
    if not profile:
        return fallback_company_id
    return profile.get("company_id") or fallback_company_id


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


def _operator_profile_company_ids(profile: OperatorProfile) -> list[int]:
    if profile.company_ids:
        try:
            return _normalize_company_ids(json.loads(profile.company_ids), profile.company_id)
        except (TypeError, ValueError):
            pass
    return [int(profile.company_id)]


def _sync_memberships(session, user: User, memberships: list[dict] | None, company_id: int | None) -> None:
    now = datetime.now(UTC).isoformat()
    desired = memberships
    if desired is None and company_id is not None:
        desired = [{"company_id": company_id, "role": user.role if user.role in COMPANY_ROLES else "manager", "active": True}]
    if desired is None:
        return
    by_company = {membership.company_id: membership for membership in user.company_memberships}
    seen: set[int] = set()
    for item in desired:
        cid = item.get("company_id")
        if cid is None:
            continue
        cid = int(cid)
        seen.add(cid)
        role = item.get("role") or "manager"
        if role not in COMPANY_ROLES:
            role = "manager"
        active = item.get("active", True) is not False
        existing = by_company.get(cid)
        if existing:
            existing.role = role
            existing.active = active
            existing.updated_at = now
        else:
            session.add(
                CompanyMembership(
                    user_id=user.id,
                    company_id=cid,
                    role=role,
                    active=active,
                    created_at=now,
                )
            )
    for cid, membership in by_company.items():
        if cid not in seen and desired is not None:
            membership.active = False
            membership.updated_at = now


def _sync_master_profile(session, user: User, payload: dict | None, fallback_company_id: int | None) -> None:
    if payload is None:
        return
    now = datetime.now(UTC).isoformat()
    company_id = _profile_company_id(payload, fallback_company_id)
    if company_id is None:
        return
    active = payload.get("active", True) is not False
    if user.master_profile:
        user.master_profile.company_id = int(company_id)
        user.master_profile.scope = payload.get("scope") or "own_company"
        user.master_profile.active = active
        user.master_profile.updated_at = now
    else:
        session.add(
            MasterProfile(
                user_id=user.id,
                company_id=int(company_id),
                scope=payload.get("scope") or "own_company",
                active=active,
                created_at=now,
            )
        )


def _sync_finance_profile(session, user: User, payload: dict | None, fallback_company_id: int | None) -> None:
    if payload is None:
        return
    now = datetime.now(UTC).isoformat()
    company_id = _profile_company_id(payload, fallback_company_id)
    if company_id is None:
        return
    active = payload.get("active", True) is not False
    if user.finance_profile:
        user.finance_profile.company_id = int(company_id)
        user.finance_profile.active = active
        user.finance_profile.updated_at = now
    else:
        session.add(FinanceParticipantProfile(user_id=user.id, company_id=int(company_id), active=active, created_at=now))


def _sync_operator_profile(session, user: User, payload: dict | None, fallback_company_id: int | None) -> None:
    if payload is None:
        return
    now = datetime.now(UTC).isoformat()
    company_id = _profile_company_id(payload, fallback_company_id)
    if company_id is None:
        return
    company_ids = _normalize_company_ids(payload.get("company_ids"), int(company_id))
    active = payload.get("active", True) is not False
    nickname = payload.get("nickname") or user.name or "operator"
    profile = user.operator_profile
    operator = profile.operator if profile else None
    if operator is None:
        import uuid as _uuid

        operator = Operator(
            uuid=_uuid.uuid4().hex[:12],
            nickname=nickname,
            created_at=now,
            company_id=int(company_id),
        )
        session.add(operator)
        session.flush()
    else:
        operator.nickname = nickname
        operator.company_id = int(company_id)
    if profile:
        profile.company_id = int(company_id)
        profile.company_ids = json.dumps(company_ids)
        profile.operator_id = operator.id
        profile.active = active
        profile.updated_at = now
    else:
        session.add(
            OperatorProfile(
                user_id=user.id,
                company_id=int(company_id),
                company_ids=json.dumps(company_ids),
                operator_id=operator.id,
                active=active,
                created_at=now,
            )
        )


def create_user(
    name: str,
    login: str | None = None,
    password: str | None = None,
    role: str = "manager",
    system_role=UNSET,
    active: bool = True,
    company_id: int | None = None,
    company_memberships: list[dict] | None = None,
    master_profile: dict | None = None,
    operator_profile: dict | None = None,
    finance_profile: dict | None = None,
) -> dict:
    if role not in ROLE_PERMISSIONS:
        raise ValueError("unknown_role")
    if system_role not in (UNSET, None) and system_role not in ROLE_PERMISSIONS:
        raise ValueError("unknown_role")
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        user = User(
            name=name,
            login=login.strip() if login else None,
            password_hash=hash_password(password) if password else None,
            role=role,
            system_role=(system_role if system_role is not UNSET else None),
            active=active,
            company_id=company_id,
            created_at=now,
        )
        session.add(user)
        session.flush()
        _sync_memberships(session, user, company_memberships, company_id)
        _sync_master_profile(session, user, master_profile, company_id)
        _sync_operator_profile(session, user, operator_profile, company_id)
        _sync_finance_profile(session, user, finance_profile, company_id)
        session.commit()
        session.refresh(user)
        return user_to_dict(user)


def update_user(
    user_id: int,
    name: str | None = None,
    login: str | None = None,
    password: str | None = None,
    role: str | None = None,
    system_role=UNSET,
    active: bool | None = None,
    company_id=UNSET,
    company_memberships: list[dict] | None = None,
    master_profile: dict | None = None,
    operator_profile: dict | None = None,
    finance_profile: dict | None = None,
) -> dict | None:
    if role is not None and role not in ROLE_PERMISSIONS:
        raise ValueError("unknown_role")
    if system_role not in (UNSET, None) and system_role not in ROLE_PERMISSIONS:
        raise ValueError("unknown_role")
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return None
        if name is not None:
            user.name = name
        if login is not None:
            user.login = login.strip() or None
        if password:
            user.password_hash = hash_password(password)
        if role is not None:
            user.role = role
        if system_role is not UNSET:
            user.system_role = system_role
        if active is not None:
            user.active = active
        if company_id is not UNSET:
            user.company_id = company_id
        session.flush()
        fallback_company_id = user.company_id
        _sync_memberships(session, user, company_memberships, fallback_company_id)
        _sync_master_profile(session, user, master_profile, fallback_company_id)
        _sync_operator_profile(session, user, operator_profile, fallback_company_id)
        _sync_finance_profile(session, user, finance_profile, fallback_company_id)
        session.commit()
        session.refresh(user)
        return user_to_dict(user)


def delete_user(user_id: int) -> bool:
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return False
        session.delete(user)
        session.commit()
        return True


def authenticate_user(login: str, password: str) -> User | None:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        user = (
            session.query(User)
            .options(
                joinedload(User.company),
                joinedload(User.company_memberships).joinedload(CompanyMembership.company),
                joinedload(User.master_profile).joinedload(MasterProfile.company),
                joinedload(User.operator_profile).joinedload(OperatorProfile.company),
                joinedload(User.operator_profile).joinedload(OperatorProfile.operator),
                joinedload(User.finance_profile).joinedload(FinanceParticipantProfile.company),
            )
            .filter(User.login == login.strip(), User.active.is_(True))
            .first()
        )
        if not user or not verify_password(password, user.password_hash):
            return None
        session.expunge(user)
        return user


def create_session(user_id: int, *, ttl_hours: int = SESSION_TTL_HOURS) -> str:
    now = datetime.now(UTC)
    token = secrets.token_urlsafe(32)
    with get_session() as session:
        session.add(
            AdminSession(
                token=token,
                user_id=user_id,
                created_at=now.isoformat(),
                expires_at=(now + timedelta(hours=ttl_hours)).isoformat(),
            )
        )
        session.commit()
    return token


def get_session_user(token: str | None) -> User | None:
    from sqlalchemy.orm import joinedload

    if not token:
        return None
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        admin_session = (
            session.query(AdminSession)
            .options(
                joinedload(AdminSession.user).joinedload(User.company),
                joinedload(AdminSession.user).joinedload(User.company_memberships).joinedload(CompanyMembership.company),
                joinedload(AdminSession.user).joinedload(User.master_profile).joinedload(MasterProfile.company),
                joinedload(AdminSession.user).joinedload(User.operator_profile).joinedload(OperatorProfile.company),
                joinedload(AdminSession.user).joinedload(User.operator_profile).joinedload(OperatorProfile.operator),
                joinedload(AdminSession.user).joinedload(User.finance_profile).joinedload(FinanceParticipantProfile.company),
            )
            .join(User, AdminSession.user_id == User.id)
            .filter(
                AdminSession.token == token,
                User.active.is_(True),
            )
            .first()
        )
        if not admin_session:
            return None
        if admin_session.expires_at and admin_session.expires_at < now:
            return None
        user = admin_session.user
        session.expunge(user)
        return user


def ensure_master_profile_for_user(user_id: int, company_id: int | None) -> None:
    """Ensure an API-key owner has a master profile for plugin token use."""
    if company_id is None:
        return
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        existing = session.query(MasterProfile).filter(MasterProfile.user_id == user_id).first()
        if existing:
            existing.company_id = company_id
            existing.scope = "own_company"
            existing.active = True
            existing.updated_at = now
        else:
            session.add(
                MasterProfile(
                    user_id=user_id,
                    company_id=company_id,
                    scope="own_company",
                    active=True,
                    created_at=now,
                )
            )
        session.commit()


def list_finance_participants(company_id: int | None = None) -> list[dict]:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        query = (
            session.query(User)
            .join(FinanceParticipantProfile, FinanceParticipantProfile.user_id == User.id)
            .options(
                joinedload(User.company),
                joinedload(User.finance_profile).joinedload(FinanceParticipantProfile.company),
            )
            .filter(User.active.is_(True), FinanceParticipantProfile.active.is_(True))
            .order_by(User.name)
        )
        if company_id is not None:
            query = query.filter(FinanceParticipantProfile.company_id == company_id)
        return [user_to_dict(user) for user in query.all()]


def get_user_stats(user_id: int) -> dict | None:
    """Return operational and finance statistics for one admin user."""
    from sqlalchemy import func

    from src.entities import ApiKey, Expense, Payout, PayoutShare, UsageLog

    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return None
        user_dict = user_to_dict(user)

        api_keys = (
            session.query(ApiKey)
            .filter(ApiKey.user_id == user_id)
            .order_by(ApiKey.created_at.desc())
            .all()
        )
        api_key_ids = [key.id for key in api_keys]
        usage_query = session.query(UsageLog)
        if api_key_ids:
            usage_query = usage_query.filter(UsageLog.api_key_id.in_(api_key_ids))
        else:
            usage_query = usage_query.filter(False)

        total_usage = usage_query.count()
        confirmed_usage = usage_query.filter(UsageLog.status == "confirmed").count()
        failed_usage = usage_query.filter(UsageLog.status == "failed").count()
        pending_usage = usage_query.filter(UsageLog.status == "pending").count()
        revenue = usage_query.with_entities(func.coalesce(func.sum(UsageLog.price), 0)).scalar() or 0

        expenses_total = (
            session.query(func.coalesce(func.sum(Expense.amount), 0))
            .filter(Expense.user_id == user_id)
            .scalar()
            or 0
        )
        payout_total = (
            session.query(func.coalesce(func.sum(PayoutShare.total), 0))
            .filter(PayoutShare.user_id == user_id)
            .scalar()
            or 0
        )
        payout_count = (
            session.query(PayoutShare.payout_id)
            .filter(PayoutShare.user_id == user_id)
            .distinct()
            .count()
        )
        recent_usage = [
            {
                "id": log.id,
                "reservation_id": log.reservation_id,
                "status": log.status,
                "price": log.price,
                "paid": bool(log.paid) if log.paid is not None else None,
                "created_at": log.created_at,
                "confirmed_at": log.confirmed_at,
            }
            for log in usage_query.order_by(UsageLog.created_at.desc()).limit(10).all()
        ]
        recent_payouts = (
            session.query(Payout, PayoutShare)
            .join(PayoutShare, PayoutShare.payout_id == Payout.id)
            .filter(PayoutShare.user_id == user_id)
            .order_by(Payout.created_at.desc())
            .limit(10)
            .all()
        )

        return {
            "user": user_dict,
            "api_keys": {
                "count": len(api_keys),
                "active": sum(1 for key in api_keys if key.active),
                "items": [
                    {
                        "id": key.id,
                        "label": key.label,
                        "active": key.active,
                        "usage_count": key.usage_count,
                        "company_id": key.company_id,
                        "created_at": key.created_at,
                    }
                    for key in api_keys
                ],
            },
            "usage": {
                "total": total_usage,
                "confirmed": confirmed_usage,
                "failed": failed_usage,
                "pending": pending_usage,
                "revenue": int(revenue),
                "recent": recent_usage,
            },
            "expenses": {
                "total_amount": int(expenses_total),
            },
            "payouts": {
                "count": payout_count,
                "total_amount": float(payout_total),
                "recent": [
                    {
                        "id": payout.id,
                        "name": payout.name,
                        "status": payout.status,
                        "created_at": payout.created_at,
                        "completed_at": payout.completed_at,
                        "total": share.total,
                    }
                    for payout, share in recent_payouts
                ],
            },
        }
