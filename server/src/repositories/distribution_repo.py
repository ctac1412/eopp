from datetime import UTC, datetime

from sqlalchemy import text

from src.entities import ApiKey, DistributionAnswer, Operator, UsageLog, get_session


def _ensure_columns(session):
    try:
        session.execute(text(
            "ALTER TABLE distribution_answers ADD COLUMN usage_log_id INTEGER DEFAULT 0"
        ))
        session.commit()
    except Exception:
        session.rollback()
        pass


def _ensure_duration_column(session):
    try:
        session.execute(text(
            "ALTER TABLE distribution_answers ADD COLUMN duration_ms INTEGER"
        ))
        session.commit()
    except Exception:
        session.rollback()
        pass


def save_distribution_answer(
    usage_log_id: int | None,
    captcha_id: str,
    operator_id: int,
    icon_position: int,
    x: int,
    y: int,
    duration_ms: int | None = None,
) -> None:
    with get_session() as session:
        _ensure_columns(session)
        _ensure_duration_column(session)
        answer = DistributionAnswer(
            usage_log_id=usage_log_id,
            captcha_id=captcha_id,
            operator_id=operator_id,
            icon_position=icon_position,
            x=x,
            y=y,
            duration_ms=duration_ms,
            created_at=datetime.now(UTC).isoformat(),
        )
        session.add(answer)
        session.commit()


def get_distribution_answers(page: int = 1, per_page: int = 50) -> dict:
    """Return paginated distribution answers with operator nickname."""
    with get_session() as session:
        base_q = session.query(DistributionAnswer)
        total = base_q.count()
        pages = max(1, (total + per_page - 1) // per_page) if total > 0 else 1
        page = max(1, min(page, pages))

        rows = (
            session.query(DistributionAnswer, Operator, ApiKey)
            .outerjoin(Operator, Operator.id == DistributionAnswer.operator_id)
            .outerjoin(UsageLog, UsageLog.id == DistributionAnswer.usage_log_id)
            .outerjoin(ApiKey, ApiKey.id == UsageLog.api_key_id)
            .order_by(DistributionAnswer.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        items = [
            {
                "id": a.id,
                "captcha_id": a.captcha_id,
                "operator_id": a.operator_id,
                "operator_nickname": (
                    (apikey.label if apikey else "Мастер")
                    if a.operator_id == 0
                    else (op.nickname if op else f"#{a.operator_id}")
                ),
                "master_key_id": apikey.id if apikey else None,
                "master_label": apikey.label if apikey else None,
                "icon_position": a.icon_position,
                "x": a.x,
                "y": a.y,
                "duration_ms": a.duration_ms,
                "created_at": a.created_at,
            }
            for a, op, apikey in rows
        ]
        return {"items": items, "total": total, "page": page, "pages": pages, "per_page": per_page}
