import secrets
from datetime import UTC, datetime

from src.db.usage_log import calc_debt
from src.entities import ApiKey, Company, get_session


def create_key(
    label: str,
    max_uses: int | None = None,
    company_id: int | None = None,
    user_id: int | None = None,
) -> ApiKey:
    with get_session() as session:
        if user_id is not None:
            existing = session.query(ApiKey).filter(ApiKey.user_id == user_id).first()
            if existing:
                raise ValueError("User already has a personal API key")
        key = ApiKey(
            key=secrets.token_hex(16),
            label=label,
            created_at=datetime.now(UTC).isoformat(),
            max_uses=max_uses,
            active=True,
            company_id=company_id,
            user_id=user_id,
        )
        session.add(key)
        session.flush()
        session.refresh(key)
        session.commit()
        return key


def _executor_access(user_id: int | None) -> dict:
    if user_id is None:
        return {"all_companies": False, "company_ids": []}
    from src.repositories import user_company_access_repo

    return user_company_access_repo.user_access_payload("executor", user_id)


def _executor_company_names(company_ids: list[int]) -> list[str]:
    if not company_ids:
        return []
    with get_session() as session:
        rows = (
            session.query(Company)
            .filter(Company.id.in_([int(company_id) for company_id in company_ids]))
            .order_by(Company.name)
            .all()
        )
        return [row.name for row in rows]


def _is_executor(access: dict) -> bool:
    return bool(access.get("all_companies") or access.get("company_ids"))


def list_keys(company_id: int | None = None, *, include_test_users: bool = True) -> list[dict]:
    from sqlalchemy.orm import joinedload

    from src.entities import User

    with get_session() as session:
        query = (
            session.query(ApiKey)
            .options(joinedload(ApiKey.company), joinedload(ApiKey.user))
            .outerjoin(User, User.id == ApiKey.user_id)
        )
        if company_id is not None:
            query = query.filter(User.company_id == company_id)
        if not include_test_users:
            query = query.filter((ApiKey.user_id.is_(None)) | (User.is_test.is_(False)))
        keys = query.order_by(ApiKey.created_at.desc()).all()
        result = []
        for k in keys:
            d = {
                "id": k.id,
                "key": k.key,
                "label": k.label,
                "created_at": k.created_at,
                "usage_count": k.usage_count,
                "max_uses": k.max_uses,
                "active": k.active,
                "comment": k.comment,
                "is_admin": k.is_admin,
                "is_super_kiosk": k.is_super_kiosk,
                "is_external": k.is_external,
                "company_id": k.company_id,
                "company_name": k.company.name if k.company else None,
                "user_id": k.user_id,
                "user_name": k.user.name if k.user else None,
            }
            executor_access = _executor_access(k.user_id)
            d["is_master_key"] = _is_executor(executor_access)
            d["executor_all_companies"] = executor_access["all_companies"]
            d["executor_company_ids"] = executor_access["company_ids"]
            d["executor_company_names"] = _executor_company_names(executor_access["company_ids"])
            d["user_role"] = k.user.role if k.user else None
            if k.company_id is not None:
                from src.repositories import tariff_repo

                company_tariff = tariff_repo.get_company_tariff(k.company_id)
                if company_tariff:
                    d["tariff"] = tariff_repo.tariff_to_dict(
                        company_tariff,
                        source="company",
                        company_id=k.company_id,
                    )
            d["debt"] = calc_debt(k.id)
            result.append(d)
        return result


def list_plugin_keys_for_user(user_id: int, company_id: int | None = None, *, include_company: bool = True) -> list[dict]:
    """Return active plugin tokens available to one authenticated site user."""
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        query = (
            session.query(ApiKey)
            .options(joinedload(ApiKey.company), joinedload(ApiKey.user))
            .filter(ApiKey.active.is_(True), ApiKey.user_id == user_id)
        )
        keys = query.order_by(ApiKey.user_id.desc(), ApiKey.created_at.desc()).all()
        executor_access = _executor_access(user_id)
        return [
            {
                "id": key.id,
                "key": key.key,
                "label": key.label,
                "user_id": key.user_id,
                "user_name": key.user.name if key.user else None,
                "executor_company_ids": executor_access["company_ids"],
                "executor_all_companies": executor_access["all_companies"],
                "is_super_kiosk": key.is_super_kiosk,
            }
            for key in keys
        ]


def list_keys_for_operator(
    allowed_master_keys: list[int] | None = None,
    company_ids: list[int] | None = None,
) -> list[dict]:
    """Return active keys for operator master selection.

    If allowed_master_keys is provided, only those key IDs are returned.
    External keys are included — they can also have operators assigned.
    """
    with get_session() as session:
        query = (
            session.query(ApiKey)
            .filter(
                ApiKey.active == True,
            )
            .order_by(ApiKey.created_at.desc())
        )
        if allowed_master_keys is not None:
            if not allowed_master_keys:
                return []
            query = query.filter(ApiKey.id.in_(allowed_master_keys))
        keys = query.all()
        result = []
        operator_company_ids = {int(company_id) for company_id in (company_ids or [])}
        for key in keys:
            access = _executor_access(key.user_id)
            if not _is_executor(access):
                continue
            if company_ids is not None and not access["all_companies"]:
                executor_company_ids = {int(company_id) for company_id in access["company_ids"]}
                if not operator_company_ids or not executor_company_ids.intersection(operator_company_ids):
                    continue
            result.append(
                {
                    "id": key.id,
                    "label": key.label,
                    "active": key.active,
                    "key": key.key,
                    "company_id": key.company_id,
                    "executor_company_ids": access["company_ids"],
                    "executor_all_companies": access["all_companies"],
                    "executor_company_names": _executor_company_names(access["company_ids"]),
                }
            )
        return result


def get_key_by_id(key_id: int) -> ApiKey | None:
    with get_session() as session:
        return session.get(ApiKey, key_id)


def is_test_user_key(key_id: int | None) -> bool:
    if key_id is None:
        return False
    from src.entities import User

    with get_session() as session:
        row = (
            session.query(User.is_test)
            .join(ApiKey, ApiKey.user_id == User.id)
            .filter(ApiKey.id == key_id)
            .first()
        )
        return bool(row and row[0])


def get_key_record(api_key: str) -> ApiKey | None:
    with get_session() as session:
        return session.query(ApiKey).filter(ApiKey.key == api_key).first()


def get_active_key_for_user(user_id: int) -> ApiKey | None:
    with get_session() as session:
        return (
            session.query(ApiKey)
            .filter(ApiKey.user_id == user_id, ApiKey.active.is_(True))
            .order_by(ApiKey.created_at.desc())
            .first()
        )


def update_key(key_id: int, **kwargs) -> ApiKey | None:
    with get_session() as session:
        key = session.get(ApiKey, key_id)
        if not key:
            return None
        next_user_id = kwargs.get("user_id")
        if next_user_id is not None and next_user_id != key.user_id:
            existing = (
                session.query(ApiKey)
                .filter(ApiKey.user_id == next_user_id, ApiKey.id != key_id)
                .first()
            )
            if existing:
                raise ValueError("User already has a personal API key")
        for attr, value in kwargs.items():
            if value is not None:
                setattr(key, attr, value)
        session.commit()
        session.refresh(key)
        return key


def update_api_key(api_key_id: int, body, *, admin_id: int | None = None, access_decision=None) -> ApiKey | None:
    """Update mutable API key fields and write a synchronous audit record."""
    import json

    with get_session() as session:
        key = session.get(ApiKey, api_key_id)
        if not key:
            return None
        changes = {}
        if body.label is not None and body.label != key.label:
            changes["label"] = (key.label, body.label)
            key.label = body.label
        if body.max_uses is not None and body.max_uses != key.max_uses:
            changes["max_uses"] = (str(key.max_uses), str(body.max_uses))
            key.max_uses = body.max_uses
        if body.active is not None and body.active != key.active:
            changes["active"] = (str(key.active), str(body.active))
            key.active = body.active
        if body.comment is not None and body.comment != key.comment:
            changes["comment"] = (key.comment, body.comment)
            key.comment = body.comment
        if body.is_admin is not None and body.is_admin != key.is_admin:
            changes["is_admin"] = (str(key.is_admin), str(body.is_admin))
            key.is_admin = body.is_admin
        if body.is_super_kiosk is not None and body.is_super_kiosk != key.is_super_kiosk:
            changes["is_super_kiosk"] = (str(key.is_super_kiosk), str(body.is_super_kiosk))
            key.is_super_kiosk = body.is_super_kiosk
        if body.is_external is not None and body.is_external != key.is_external:
            changes["is_external"] = (str(key.is_external), str(body.is_external))
            key.is_external = body.is_external
        if body.company_id is not None and body.company_id != key.company_id:
            changes["company_id"] = (str(key.company_id), "None")
            key.company_id = None
        if body.user_id is not None and body.user_id != key.user_id:
            existing = (
                session.query(ApiKey)
                .filter(ApiKey.user_id == body.user_id, ApiKey.id != api_key_id)
                .first()
            )
            if existing:
                raise ValueError("User already has a personal API key")
            changes["user_id"] = (str(key.user_id), str(body.user_id))
            key.user_id = body.user_id
        session.commit()
        session.refresh(key)

        if changes:
            old_value = json.dumps({k: v[0] for k, v in changes.items()}, ensure_ascii=False)
            new_value = json.dumps({k: v[1] for k, v in changes.items()}, ensure_ascii=False)
            if access_decision is not None:
                from src.modules.audit.service import AuditService

                AuditService().record_admin_action(
                    "api_key.changed",
                    decision=access_decision,
                    target_type="api_key",
                    target_id=api_key_id,
                    old_value=old_value,
                    new_value=new_value,
                    metadata={"changed_fields": sorted(changes)},
                )
                AuditService().record_admin_action(
                    "update_api_key",
                    decision=access_decision,
                    target_type="api_key",
                    target_id=api_key_id,
                    old_value=old_value,
                    new_value=new_value,
                    metadata={"legacy_action": True, "changed_fields": sorted(changes)},
                )
            elif admin_id is not None:
                from src.db.audit_log import log_audit

                log_audit(
                    admin_id=admin_id,
                    action="update_api_key",
                    target_type="api_key",
                    target_id=api_key_id,
                    old_value=old_value,
                    new_value=new_value,
                )
        return key


def delete_key(key_id: int) -> bool:
    with get_session() as session:
        key = session.get(ApiKey, key_id)
        if not key:
            return False
        session.delete(key)
        session.commit()
        return True


def reset_usage(key_id: int) -> ApiKey | None:
    with get_session() as session:
        key = session.get(ApiKey, key_id)
        if not key:
            return None
        key.usage_count = 0
        session.commit()
        session.refresh(key)
        return key


def validate_api_key(api_key: str) -> dict:
    with get_session() as session:
        record = session.query(ApiKey).filter(ApiKey.key == api_key).first()
        user_active = record.user.active if record and record.user_id is not None and record.user else True
    if not record:
        return {"valid": False, "reason": "Key not found"}
    if not user_active:
        return {"valid": False, "reason": "User is disabled"}
    if not record.active:
        return {"valid": False, "reason": "Key is disabled"}
    if record.max_uses is not None and record.usage_count >= record.max_uses:
        return {
            "valid": False,
            "reason": "Maximum uses exceeded",
            "remaining": 0,
            "max_uses": record.max_uses,
        }
    remaining = None
    if record.max_uses is not None:
        remaining = record.max_uses - record.usage_count
    executor_access = _executor_access(record.user_id)
    return {
        "valid": True,
        "label": record.label,
        "remaining": remaining,
        "max_uses": record.max_uses,
        "user_id": record.user_id,
        "executor_company_ids": executor_access["company_ids"],
        "executor_all_companies": executor_access["all_companies"],
    }


def get_key_by_label(label: str) -> ApiKey | None:
    with get_session() as session:
        return session.query(ApiKey).filter(ApiKey.label == label).first()


def is_super_kiosk_key(key: str) -> bool:
    with get_session() as session:
        return (
            session.query(ApiKey)
            .filter(ApiKey.key == key, ApiKey.active.is_(True), ApiKey.is_super_kiosk.is_(True))
            .first()
            is not None
        )
