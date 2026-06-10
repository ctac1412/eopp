"""Operator and operator-master link repository."""

import json as _json
import logging
import uuid as _uuid
from datetime import UTC, datetime

from src.entities import ApiKey, Operator, OperatorMasterLink, get_session

logger = logging.getLogger("eopp.operator_repo")


def _operator_to_dict(op: Operator) -> dict:
    return {
        "id": op.id,
        "uuid": op.uuid,
        "nickname": op.nickname,
        "created_at": op.created_at,
        "icon_display_mode": op.icon_display_mode,
        "allowed_master_keys": (
            _json.loads(op.allowed_master_keys)
            if op.allowed_master_keys
            else None
        ),
        "online": op.online,
        "company_id": op.company_id,
    }


def create_operator(nickname: str, company_id: int | None = None) -> dict:
    with get_session() as session:
        op = Operator(
            uuid=_uuid.uuid4().hex[:12],
            nickname=nickname,
            created_at=datetime.now(UTC).isoformat(),
            company_id=company_id,
        )
        session.add(op)
        session.flush()
        session.commit()
        return _operator_to_dict(op)


def list_operators() -> list[dict]:
    with get_session() as session:
        ops = session.query(Operator).order_by(Operator.created_at.desc()).all()
        return [
            {**_operator_to_dict(o), "company_name": o.company.name if o.company else None}
            for o in ops
        ]


def get_operator_by_uuid(uuid: str) -> dict | None:
    with get_session() as session:
        op = session.query(Operator).filter(Operator.uuid == uuid).first()
        if not op:
            return None
        return _operator_to_dict(op)


def get_operator_by_id(operator_id: int) -> dict | None:
    with get_session() as session:
        op = session.get(Operator, operator_id)
        if not op:
            return None
        return _operator_to_dict(op)


def update_operator(operator_id: int, **kwargs) -> dict | None:
    with get_session() as session:
        op = session.get(Operator, operator_id)
        if not op:
            return None
        for attr, value in kwargs.items():
            if value is not None and hasattr(op, attr):
                setattr(op, attr, value)
        session.commit()
        session.refresh(op)
        return _operator_to_dict(op)


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


def get_active_links() -> list[dict]:
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
        return [
            {
                "link_id": link.id,
                "operator_id": op.id,
                "operator_nickname": op.nickname,
                "operator_uuid": op.uuid,
                "operator_online": op.online,
                "master_key_id": key.id,
                "master_label": key.label,
                "created_at": link.created_at,
            }
            for link, op, key in rows
        ]
