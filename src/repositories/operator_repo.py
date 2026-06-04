"""Operator and operator-master link repository."""

import uuid as _uuid
from datetime import UTC, datetime

from src.entities import Operator, OperatorMasterLink, get_session


def create_operator(nickname: str) -> dict:
    with get_session() as session:
        op = Operator(
            uuid=_uuid.uuid4().hex[:12],
            nickname=nickname,
            created_at=datetime.now(UTC).isoformat(),
        )
        session.add(op)
        session.flush()
        session.commit()
        return {"id": op.id, "uuid": op.uuid, "nickname": op.nickname}


def list_operators() -> list[dict]:
    with get_session() as session:
        ops = session.query(Operator).order_by(Operator.created_at.desc()).all()
        return [{"id": o.id, "uuid": o.uuid, "nickname": o.nickname, "created_at": o.created_at} for o in ops]


def get_operator_by_uuid(uuid: str) -> dict | None:
    with get_session() as session:
        op = session.query(Operator).filter(Operator.uuid == uuid).first()
        if not op:
            return None
        return {"id": op.id, "uuid": op.uuid, "nickname": op.nickname}


def delete_operator(operator_id: int) -> bool:
    with get_session() as session:
        op = session.get(Operator, operator_id)
        if not op:
            return False
        session.delete(op)
        session.commit()
        return True


def link_operator_to_master(operator_id: int, master_key_id: int) -> int:
    with get_session() as session:
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
            return existing.id

        link = OperatorMasterLink(
            operator_id=operator_id,
            master_key_id=master_key_id,
            active=True,
            created_at=datetime.now(UTC).isoformat(),
        )
        session.add(link)
        session.flush()
        session.commit()
        return link.id


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
    """Return operator IDs subscribed to this master."""
    with get_session() as session:
        links = (
            session.query(OperatorMasterLink)
            .filter(
                OperatorMasterLink.master_key_id == master_key_id,
                OperatorMasterLink.active == True,
            )
            .all()
        )
        return [l.operator_id for l in links]
