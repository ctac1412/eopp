from datetime import UTC, datetime

from sqlalchemy import text

from src.entities import DistributionAnswer, get_session


def _ensure_columns(session):
    try:
        session.execute(text(
            "ALTER TABLE distribution_answers ADD COLUMN usage_log_id INTEGER DEFAULT 0"
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
) -> None:
    with get_session() as session:
        _ensure_columns(session)
        answer = DistributionAnswer(
            usage_log_id=usage_log_id,
            captcha_id=captcha_id,
            operator_id=operator_id,
            icon_position=icon_position,
            x=x,
            y=y,
            created_at=datetime.now(UTC).isoformat(),
        )
        session.add(answer)
        session.commit()
