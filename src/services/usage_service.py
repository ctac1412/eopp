import json
import os

from src.constants import NO_VALID_DIR, VALID_DIR
from src.entities import UsageLog
from src.policies.access_policy import is_admin_token
from src.repositories import api_key_repo, usage_log_repo
from src.sse import lock, sse_queues


def _parse_config_json(usage_log: UsageLog) -> dict | None:
    if not usage_log.config_json:
        return None
    try:
        return json.loads(usage_log.config_json)
    except (json.JSONDecodeError, TypeError):
        return None


def _usage_to_dict(record: UsageLog, label: str | None = None) -> dict:
    logs_raw = record.logs
    logs = json.loads(logs_raw) if logs_raw else None
    return {
        "id": record.id,
        "api_key_id": record.api_key_id,
        "reservation_id": record.reservation_id,
        "captcha_id": record.captcha_id,
        "status": record.status,
        "error_message": record.error_message,
        "error_stage": record.error_stage,
        "slot_date": record.slot_date,
        "logs": logs,
        "config_json": _parse_config_json(record),
        "created_at": record.created_at,
        "confirmed_at": record.confirmed_at,
        "label": label or (record.api_key.label if record.api_key else None),
        "price": record.price,
        "paid": bool(record.paid) if record.paid is not None else None,
        "op_type": record.op_type,
        "company": record.company,
        "fio": record.fio,
        "vehicle_number": record.vehicle_number,
        "is_test": bool(record.is_test) if record.is_test is not None else False,
        "invoice_id": record.invoice_id,
    }


def move_captcha_to_valid(captcha_id: str, variant_index: int) -> None:
    if not captcha_id:
        return
    no_valid_file = os.path.join(NO_VALID_DIR, f"{captcha_id}.json")
    if not os.path.exists(no_valid_file):
        return
    valid_file = os.path.join(VALID_DIR, f"{captcha_id}.json")
    if os.path.exists(valid_file):
        return
    try:
        with open(no_valid_file) as f:
            source_data = json.load(f)
        source_data["valid_index"] = variant_index
        with open(valid_file, "w") as f:
            json.dump(source_data, f, indent=2)
        os.remove(no_valid_file)
    except Exception:
        pass


def register_usage(body) -> tuple[int, dict]:
    validation = api_key_repo.validate_api_key(body.api_key)
    if not validation["valid"]:
        return 403, {"error": "Invalid API key"}

    key_record = api_key_repo.get_key_record(body.api_key)
    if not key_record:
        return 403, {"error": "Invalid API key"}

    api_key_id = key_record.id
    with lock:
        has_active_stream = len(sse_queues.get(api_key_id, [])) > 0
    if not has_active_stream:
        return 412, {
            "error": "no_stream",
            "message": "Откройте страницу с капчами и авторизуйтесь. Требуется активное SSE-подключение.",
        }

    usage_log_id = usage_log_repo.create_usage(
        api_key=body.api_key,
        reservation_id=body.reservation_id,
        captcha_id=body.captcha_id or "unknown",
        config_json=body.config_json,
    )
    return 200, {"usage_log_id": usage_log_id}


def confirm_usage(body) -> tuple[int, dict]:
    key_record = api_key_repo.get_key_record(body.api_key)
    if not key_record:
        return 403, {"error": "Invalid API key"}

    log_entry = usage_log_repo.get_usage(body.usage_log_id)
    if not log_entry or log_entry.api_key_id != key_record.id:
        return 404, {"error": "Usage log entry not found"}

    if body.captcha_id and body.valid_variant_index is not None:
        move_captcha_to_valid(body.captcha_id, body.valid_variant_index)

    ok = usage_log_repo.confirm_usage(body.usage_log_id, body.slot_date, body.logs, body.captcha_id)
    if not ok:
        return 404, {"error": "Usage log entry not found"}
    return 200, {"ok": True}


def fail_usage(body) -> tuple[int, dict]:
    key_record = api_key_repo.get_key_record(body.api_key)
    if not key_record:
        return 403, {"error": "Invalid API key"}

    log_entry = usage_log_repo.get_usage(body.usage_log_id)
    if not log_entry or log_entry.api_key_id != key_record.id:
        return 404, {"error": "Usage log entry not found"}

    if body.captcha_id and body.valid_variant_index is not None:
        move_captcha_to_valid(body.captcha_id, body.valid_variant_index)

    ok = usage_log_repo.fail_usage(
        body.usage_log_id,
        body.error_message,
        body.error_stage,
        body.slot_date,
        body.logs,
        body.captcha_id,
    )
    if not ok:
        return 404, {"error": "Usage log entry not found"}
    return 200, {"ok": True}


def delete_usage(usage_log_id: int, admin_token: str | None) -> tuple[int, dict]:
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}

    ok = usage_log_repo.delete_usage(usage_log_id)
    if not ok:
        return 404, {"error": "Usage log entry not found"}
    return 200, {"ok": True}


def list_usage(
    admin_token: str | None,
    api_key_id: int | None = None,
    api_key: str | None = None,
    hide_test: bool = True,
) -> tuple[int, list[dict] | dict]:
    is_admin = is_admin_token(admin_token)

    if api_key_id is not None and not is_admin:
        return 401, {"error": "Unauthorized"}

    if api_key:
        key_record = api_key_repo.get_key_record(api_key)
        if not key_record:
            return 403, {"error": "Invalid API key"}
        if not is_admin:
            api_key_id = key_record.id
        elif api_key_id is None:
            api_key_id = key_record.id
    elif not is_admin:
        return 401, {"error": "Unauthorized"}

    records = usage_log_repo.list_usage(api_key_id)
    if hide_test:
        records = [r for r in records if not _is_hidden_test_record(r)]
    return 200, [_usage_to_dict(r) for r in records]


def _is_hidden_test_record(record: UsageLog) -> bool:
    reservation_id = record.reservation_id or ""
    if reservation_id in ("unknown", ""):
        return True
    if reservation_id.startswith("00000000-0000-0000-0000-000000000000"):
        return True
    config_json = _parse_config_json(record)
    return bool(
        config_json and isinstance(config_json.get("runUpTo"), int) and config_json["runUpTo"] < 5
    )
