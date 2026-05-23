import secrets
from datetime import UTC, datetime

from src.db.usage_log import calc_debt
from src.entities import ApiKey, get_session


def create_key(label: str, max_uses: int | None = None) -> ApiKey:
    with get_session() as session:
        key = ApiKey(
            key=secrets.token_hex(16),
            label=label,
            created_at=datetime.now(UTC).isoformat(),
            max_uses=max_uses,
            active=True,
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
            .options(joinedload(ApiKey.tariff))
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
            }
            if k.tariff:
                d["tariff"] = {
                    "price_create": k.tariff.price_create,
                    "price_reschedule": k.tariff.price_reschedule,
                    "price_create_peak": k.tariff.price_create_peak,
                }
            d["debt"] = calc_debt(k.id)
            result.append(d)
        return result


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


def update_api_key(api_key_id: int, body) -> ApiKey | None:
    with get_session() as session:
        key = session.get(ApiKey, api_key_id)
        if not key:
            return None
        if body.label is not None:
            key.label = body.label
        if body.max_uses is not None:
            key.max_uses = body.max_uses
        if body.active is not None:
            key.active = body.active
        if body.comment is not None:
            key.comment = body.comment
        if body.is_admin is not None:
            key.is_admin = body.is_admin
        if body.is_super_kiosk is not None:
            key.is_super_kiosk = body.is_super_kiosk
        session.commit()
        session.refresh(key)
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
        return {"valid": False, "reason": "Maximum uses exceeded"}
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


def is_super_kiosk_key(key: str) -> bool:
    with get_session() as session:
        return (
            session.query(ApiKey)
            .filter(ApiKey.key == key, ApiKey.active.is_(True), ApiKey.is_super_kiosk.is_(True))
            .first()
            is not None
        )
