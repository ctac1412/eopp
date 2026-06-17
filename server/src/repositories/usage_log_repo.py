import json
from datetime import UTC, datetime

from sqlalchemy.orm import joinedload

from src.db.usage_log import confirm_usage as db_confirm_usage
from src.db.usage_log import fail_usage as db_fail_usage
from src.entities import ApiKey, UsageLog, get_session
from src.platform.jobs.queue import enqueue_deferred_job


def _defer_job(name: str, payload: dict) -> None:
    """Best-effort enqueue used while keeping usage creation nonblocking."""

    try:
        enqueue_deferred_job(name, payload)
    except Exception:
        pass


def create_usage(
    api_key: str,
    reservation_id: str,
    captcha_id: str,
    config_json: dict | None = None,
    sync_enrichment: bool = False,
) -> int:
    """Create the minimal usage row and defer CRM enrichment.

    ``sync_enrichment`` is accepted for adapter compatibility, but Phase 6 keeps
    company/FIO/vehicle parsing outside the registration core regardless of the
    flag value.
    """

    with get_session() as session:
        key_record = (
            session.query(ApiKey).filter(ApiKey.key == api_key).first()
        )
        if not key_record:
            raise ValueError(f"API key not found: {api_key[:8]}...")

        now = datetime.now(UTC).isoformat()
        config_str = json.dumps(config_json) if config_json else None
        extracted = {
            "op_type": None,
            "company": None,
            "fio": None,
            "vehicle_number": None,
            "has_custom_slots": False,
        }
        is_test = None
        company_obj = None

        log = UsageLog(
            api_key_id=key_record.id,
            reservation_id=reservation_id,
            status="pending",
            created_at=now,
            config_json=config_str,
            op_type=extracted["op_type"],
            company=extracted["company"],
            company_id=company_obj.id if company_obj else None,
            fio=extracted["fio"],
            vehicle_number=extracted["vehicle_number"],
            is_test=is_test,
            has_custom_slots=extracted["has_custom_slots"],
        )
        session.add(log)
        session.flush()
        log_id = log.id
        session.commit()
    _defer_job("crm.enrich_usage", {"usage_log_id": log_id, "captcha_id": captcha_id})
    return log_id


def get_usage(usage_log_id: int) -> UsageLog | None:
    with get_session() as session:
        return (
            session.query(UsageLog)
            .options(joinedload(UsageLog.api_key), joinedload(UsageLog.company_rel))
            .filter(UsageLog.id == usage_log_id)
            .first()
        )


def list_usage(
    api_key_id: int | None = None,
    invoice_id: int | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[UsageLog]:
    with get_session() as session:
        q = session.query(UsageLog).options(
            joinedload(UsageLog.api_key), joinedload(UsageLog.company_rel)
        )
        if api_key_id is not None:
            q = q.filter(UsageLog.api_key_id == api_key_id)
        if invoice_id is not None:
            q = q.filter(UsageLog.invoice_id == invoice_id)
        q = q.order_by(UsageLog.created_at.desc())
        if limit is not None:
            q = q.limit(limit).offset(offset)
        return q.all()


def confirm_usage(
    usage_log_id: int,
    slot_date: str | None = None,
    logs: list[str] | None = None,
    sync_billing: bool = True,
    sync_captcha_records: bool = True,
) -> bool | str:
    return db_confirm_usage(
        usage_log_id,
        slot_date,
        logs,
        sync_billing=sync_billing,
        sync_captcha_records=sync_captcha_records,
    )


def fail_usage(
    usage_log_id: int,
    error_message: str,
    error_stage: str,
    slot_date: str | None = None,
    logs: list[str] | None = None,
) -> bool:
    return db_fail_usage(usage_log_id, error_message, error_stage, slot_date, logs)


def delete_usage(usage_log_id: int) -> bool:
    with get_session() as session:
        log = session.get(UsageLog, usage_log_id)
        if not log:
            return False
        session.delete(log)
        session.commit()
        return True


def update_usage_log(
    usage_log_id: int, price: int | None = None, paid: bool | None = None
) -> dict | None:
    with get_session() as session:
        log = session.get(UsageLog, usage_log_id)
        if not log:
            return None
        if price is not None:
            log.price = price
        if paid is not None:
            log.paid = paid
        session.commit()
        session.refresh(log)
        return _usage_log_to_dict(log)


def get_usage_log(usage_log_id: int) -> dict | None:
    with get_session() as session:
        log = session.get(UsageLog, usage_log_id)
        if not log:
            return None
        return _usage_log_to_dict(log)


def link_usage_logs_to_invoice(invoice_id: int, usage_log_ids: list[int]) -> None:
    with get_session() as session:
        (
            session.query(UsageLog)
            .filter(UsageLog.id.in_(usage_log_ids))
            .update(
                {"invoice_id": invoice_id, "paid": 0},
                synchronize_session=False,
            )
        )
        session.commit()


def _usage_log_to_dict(log: UsageLog) -> dict:
    logs_raw = log.logs
    return {
        "id": log.id,
        "api_key_id": log.api_key_id,
        "reservation_id": log.reservation_id,
        "captcha_id": None,
        "status": log.status,
        "error_message": log.error_message,
        "error_stage": log.error_stage,
        "slot_date": log.slot_date,
        "logs": json.loads(logs_raw) if logs_raw else None,
        "config_json": json.loads(log.config_json) if log.config_json else None,
        "created_at": log.created_at,
        "confirmed_at": log.confirmed_at,
        "price": log.price,
        "paid": bool(log.paid) if log.paid is not None else None,
        "op_type": log.op_type,
        "company": log.company,
        "company_id": log.company_id,
        "company_name": log.company_rel.name if log.company_rel else None,
        "fio": log.fio,
        "vehicle_number": log.vehicle_number,
        "is_test": bool(log.is_test) if log.is_test is not None else False,
        "invoice_id": log.invoice_id,
    }
