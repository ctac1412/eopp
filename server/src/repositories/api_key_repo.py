import secrets
from datetime import UTC, datetime

from src.db.usage_log import calc_debt
from src.entities import ApiKey, get_session


def create_key(
    label: str,
    max_uses: int | None = None,
    company_id: int | None = None,
) -> ApiKey:
    with get_session() as session:
        key = ApiKey(
            key=secrets.token_hex(16),
            label=label,
            created_at=datetime.now(UTC).isoformat(),
            max_uses=max_uses,
            active=True,
            company_id=company_id,
        )
        session.add(key)
        session.flush()
        session.refresh(key)
        session.commit()
        return key


def list_keys() -> list[dict]:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        keys = (
            session.query(ApiKey)
            .options(joinedload(ApiKey.tariff), joinedload(ApiKey.company))
            .order_by(ApiKey.created_at.desc())
            .all()
        )
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
            }
            if k.tariff:
                d["tariff"] = {
                    "price_create": k.tariff.price_create,
                    "price_reschedule": k.tariff.price_reschedule,
                    "price_create_peak": k.tariff.price_create_peak,
                    "price_custom_slots": k.tariff.price_custom_slots,
                }
            d["debt"] = calc_debt(k.id)
            result.append(d)
        return result


def list_keys_for_operator(
    allowed_master_keys: list[int] | None = None,
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
        return [
            {"id": k.id, "label": k.label, "active": k.active, "key": k.key, "company_id": k.company_id}
            for k in keys
        ]


def get_key_by_id(key_id: int) -> ApiKey | None:
    with get_session() as session:
        return session.get(ApiKey, key_id)


def get_key_record(api_key: str) -> ApiKey | None:
    with get_session() as session:
        return session.query(ApiKey).filter(ApiKey.key == api_key).first()


def update_key(key_id: int, **kwargs) -> ApiKey | None:
    with get_session() as session:
        key = session.get(ApiKey, key_id)
        if not key:
            return None
        for attr, value in kwargs.items():
            if value is not None:
                setattr(key, attr, value)
        session.commit()
        session.refresh(key)
        return key


def update_api_key(api_key_id: int, body, *, admin_id: int | None = None) -> ApiKey | None:
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
        if body.admin_role is not None and body.admin_role != key.admin_role:
            changes["admin_role"] = (key.admin_role, body.admin_role)
            key.admin_role = body.admin_role
        session.commit()
        session.refresh(key)

        if changes and admin_id is not None:
            from src.db.audit_log import log_audit

            log_audit(
                admin_id=admin_id,
                action="update_api_key",
                target_type="api_key",
                target_id=api_key_id,
                old_value=json.dumps({k: v[0] for k, v in changes.items()}, ensure_ascii=False),
                new_value=json.dumps({k: v[1] for k, v in changes.items()}, ensure_ascii=False),
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
    if not record:
        return {"valid": False, "reason": "Key not found"}
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
    return {
        "valid": True,
        "label": record.label,
        "remaining": remaining,
        "max_uses": record.max_uses,
    }


def get_key_by_label(label: str) -> ApiKey | None:
    with get_session() as session:
        return session.query(ApiKey).filter(ApiKey.label == label).first()


def check_admin_token(token: str) -> bool:
    with get_session() as session:
        return (
            session.query(ApiKey)
            .filter(ApiKey.key == token, ApiKey.active.is_(True), ApiKey.is_admin.is_(True))
            .first()
            is not None
        )


def get_admin_role(token: str) -> str | None:
    """Return admin_role ('super_admin'|'manager'|None) for a valid admin token."""
    with get_session() as session:
        key = (
            session.query(ApiKey)
            .filter(ApiKey.key == token, ApiKey.active.is_(True), ApiKey.is_admin.is_(True))
            .first()
        )
        if key is None:
            return None
        return key.admin_role


def is_super_admin_token(token: str) -> bool:
    return get_admin_role(token) == "super_admin"


def is_super_kiosk_key(key: str) -> bool:
    with get_session() as session:
        return (
            session.query(ApiKey)
            .filter(ApiKey.key == key, ApiKey.active.is_(True), ApiKey.is_super_kiosk.is_(True))
            .first()
            is not None
        )
