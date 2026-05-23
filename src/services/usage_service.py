"""Usage workflow rules.

Routes should stay thin: parse HTTP inputs, call this module, return the result.
"""

import json
import os

from src.constants import NO_VALID_DIR, VALID_DIR
from src.db import check_admin_token
from src.repositories import usage_repo
from src.utils import lock, sse_queues


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


def is_admin_token(token: str | None) -> bool:
    return bool(token and check_admin_token(token))


def register_usage(body) -> tuple[int, dict]:
    validation = usage_repo.validate_api_key(body.api_key)
    if not validation["valid"]:
        return 403, {"error": "Invalid API key"}

    key_record = usage_repo.get_key_record(body.api_key)
    if not key_record:
        return 403, {"error": "Invalid API key"}

    api_key_id = key_record["id"]
    with lock:
        has_active_stream = len(sse_queues.get(api_key_id, [])) > 0
    if not has_active_stream:
        return 412, {
            "error": "no_stream",
            "message": "Откройте страницу с капчами и авторизуйтесь. Требуется активное SSE-подключение.",
        }

    usage_log_id = usage_repo.create_usage(
        api_key=body.api_key,
        reservation_id=body.reservation_id,
        captcha_id=body.captcha_id or "unknown",
        config_json=body.config_json,
    )
    return 200, {"usage_log_id": usage_log_id}


def confirm_usage(body) -> tuple[int, dict]:
    key_record = usage_repo.get_key_record(body.api_key)
    if not key_record:
        return 403, {"error": "Invalid API key"}

    log_entry = usage_repo.get_usage(body.usage_log_id)
    if not log_entry or log_entry["api_key_id"] != key_record["id"]:
        return 404, {"error": "Usage log entry not found"}

    if body.captcha_id and body.valid_variant_index is not None:
        move_captcha_to_valid(body.captcha_id, body.valid_variant_index)

    ok = usage_repo.confirm_usage(body.usage_log_id, body.slot_date, body.logs, body.captcha_id)
    if not ok:
        return 404, {"error": "Usage log entry not found"}
    return 200, {"ok": True}


def fail_usage(body) -> tuple[int, dict]:
    key_record = usage_repo.get_key_record(body.api_key)
    if not key_record:
        return 403, {"error": "Invalid API key"}

    log_entry = usage_repo.get_usage(body.usage_log_id)
    if not log_entry or log_entry["api_key_id"] != key_record["id"]:
        return 404, {"error": "Usage log entry not found"}

    if body.captcha_id and body.valid_variant_index is not None:
        move_captcha_to_valid(body.captcha_id, body.valid_variant_index)

    ok = usage_repo.fail_usage(
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

    ok = usage_repo.delete_usage(usage_log_id)
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
        key_record = usage_repo.get_key_record(api_key)
        if not key_record:
            return 403, {"error": "Invalid API key"}
        if not is_admin:
            api_key_id = key_record["id"]
        elif api_key_id is None:
            api_key_id = key_record["id"]
    elif not is_admin:
        return 401, {"error": "Unauthorized"}

    records = usage_repo.list_usage(api_key_id)
    if hide_test:
        records = [r for r in records if not _is_hidden_test_record(r)]
    return 200, records


def _is_hidden_test_record(record: dict) -> bool:
    reservation_id = record.get("reservation_id") or ""
    if reservation_id in ("unknown", ""):
        return True
    if reservation_id.startswith("00000000-0000-0000-0000-000000000000"):
        return True
    config_json = record.get("config_json")
    return bool(
        config_json
        and isinstance(config_json.get("runUpTo"), int)
        and config_json["runUpTo"] < 5
    )
