import secrets
from datetime import UTC, datetime

from src.db.usage_log import calc_debt
from src.entities import ApiKey, get_session


def create_key(
    label: str,
    max_uses: int | None = None,
    company_id: int | None = None,
    user_id: int | None = None,
) -> ApiKey:
    with get_session() as session:
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
        if user_id is not None and company_id is not None:
            from src.repositories import user_repo

            user_repo.ensure_master_profile_for_user(user_id, company_id)
        return key


def list_keys(company_id: int | None = None) -> list[dict]:
    from sqlalchemy.orm import joinedload

    with get_session() as session:
        query = (
            session.query(ApiKey)
            .options(joinedload(ApiKey.tariff), joinedload(ApiKey.company), joinedload(ApiKey.user))
        )
        if company_id is not None:
            query = query.filter(ApiKey.company_id == company_id)
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
            if k.tariff:
                d["tariff"] = {
                    "price_create": k.tariff.price_create,
                    "price_reschedule": k.tariff.price_reschedule,
                    "price_create_peak": k.tariff.price_create_peak,
                    "price_custom_slots": k.tariff.price_custom_slots,
                    "source": "api_key",
                }
            elif k.company_id is not None:
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

    from src.entities import MasterProfile

    with get_session() as session:
        profile = (
            session.query(MasterProfile)
            .filter(MasterProfile.user_id == user_id, MasterProfile.active.is_(True))
            .first()
        )
        if not profile:
            return []
        query = (
            session.query(ApiKey)
            .options(joinedload(ApiKey.company), joinedload(ApiKey.user))
            .filter(ApiKey.active.is_(True))
        )
        if profile.scope == "all_companies":
            pass
        else:
            query = query.filter(ApiKey.company_id == profile.company_id)
        keys = query.order_by(ApiKey.user_id.desc(), ApiKey.created_at.desc()).all()
        return [
            {
                "id": key.id,
                "key": key.key,
                "label": key.label,
                "company_id": key.company_id,
                "company_name": key.company.name if key.company else None,
                "user_id": key.user_id,
                "user_name": key.user.name if key.user else None,
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
        if company_ids is not None:
            if not company_ids:
                return []
            query = query.filter(ApiKey.company_id.in_([int(company_id) for company_id in company_ids]))
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
        if key.user_id is not None and key.company_id is not None:
            from src.repositories import user_repo

            user_repo.ensure_master_profile_for_user(key.user_id, key.company_id)
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
        if body.is_super_kiosk is not None and body.is_super_kiosk != key.is_super_kiosk:
            changes["is_super_kiosk"] = (str(key.is_super_kiosk), str(body.is_super_kiosk))
            key.is_super_kiosk = body.is_super_kiosk
        if body.is_external is not None and body.is_external != key.is_external:
            changes["is_external"] = (str(key.is_external), str(body.is_external))
            key.is_external = body.is_external
        if body.company_id is not None and body.company_id != key.company_id:
            changes["company_id"] = (str(key.company_id), str(body.company_id))
            key.company_id = body.company_id
        if body.user_id is not None and body.user_id != key.user_id:
            changes["user_id"] = (str(key.user_id), str(body.user_id))
            key.user_id = body.user_id
            if body.user_id is not None and key.company_id is not None:
                from src.repositories import user_repo

                user_repo.ensure_master_profile_for_user(body.user_id, key.company_id)
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


def is_super_kiosk_key(key: str) -> bool:
    with get_session() as session:
        return (
            session.query(ApiKey)
            .filter(ApiKey.key == key, ApiKey.active.is_(True), ApiKey.is_super_kiosk.is_(True))
            .first()
            is not None
        )
