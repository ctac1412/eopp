from sqlalchemy.orm import joinedload

from src.db import (
    confirm_usage as db_confirm_usage,
)
from src.db import (
    delete_usage_log as db_delete_usage_log,
)
from src.db import (
    fail_usage as db_fail_usage,
)
from src.db import (
    log_usage as db_log_usage,
)
from src.db.connection import get_connection
from src.entities import UsageLog, get_session


def create_usage(
    api_key: str,
    reservation_id: str,
    captcha_id: str,
    config_json: dict | None = None,
) -> int:
    return db_log_usage(
        api_key=api_key,
        reservation_id=reservation_id,
        captcha_id=captcha_id,
        config_json=config_json,
    )


def get_usage(usage_log_id: int) -> UsageLog | None:
    with get_session() as session:
        return (
            session.query(UsageLog)
            .options(joinedload(UsageLog.api_key))
            .filter(UsageLog.id == usage_log_id)
            .first()
        )


def list_usage(api_key_id: int | None = None) -> list[UsageLog]:
    with get_session() as session:
        q = session.query(UsageLog).options(joinedload(UsageLog.api_key))
        if api_key_id is not None:
            q = q.filter(UsageLog.api_key_id == api_key_id)
        return q.order_by(UsageLog.created_at.desc()).all()


def confirm_usage(
    usage_log_id: int,
    slot_date: str | None = None,
    logs: list[str] | None = None,
    captcha_id: str | None = None,
) -> bool:
    return db_confirm_usage(usage_log_id, slot_date, logs, captcha_id)


def fail_usage(
    usage_log_id: int,
    error_message: str,
    error_stage: str,
    slot_date: str | None = None,
    logs: list[str] | None = None,
    captcha_id: str | None = None,
) -> bool:
    return db_fail_usage(usage_log_id, error_message, error_stage, slot_date, logs, captcha_id)


def delete_usage(usage_log_id: int) -> bool:
    return db_delete_usage_log(usage_log_id)


def update_usage_log(usage_log_id: int, body) -> dict | None:
    from src.db import update_usage_log as db_update_usage_log

    return db_update_usage_log(usage_log_id, body.price, body.paid)


def get_usage_log(usage_log_id: int) -> dict | None:
    from src.db import get_usage_log_entry as db_get_usage_log_entry

    return db_get_usage_log_entry(usage_log_id)


def link_usage_logs_to_invoice(invoice_id: int, usage_log_ids: list[int]) -> None:
    conn = get_connection()
    try:
        for log_id in usage_log_ids:
            conn.execute(
                "UPDATE usage_log SET invoice_id = ?, paid = 0 WHERE id = ?",
                (invoice_id, log_id),
            )
        conn.commit()
    finally:
        conn.close()
