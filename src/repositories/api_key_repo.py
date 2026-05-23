from src.db import validate_key as db_validate_key
from src.entities import ApiKey, get_session


def validate_api_key(api_key: str) -> dict:
    return db_validate_key(api_key)


def get_key_record(api_key: str) -> ApiKey | None:
    with get_session() as session:
        return session.query(ApiKey).filter(ApiKey.key == api_key).first()


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
