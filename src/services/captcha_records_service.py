"""Access-controlled captcha-record operations."""

from src.db import check_admin_token
from src.repositories import captcha_repo


def is_admin_token(token: str | None) -> bool:
    return bool(token and check_admin_token(token))


def list_records(admin_token: str | None, usage_log_id: int | None = None) -> tuple[int, list[dict] | dict]:
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}
    return 200, captcha_repo.list_records(usage_log_id)


def get_record(admin_token: str | None, captcha_record_id: int) -> tuple[int, dict]:
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}
    record = captcha_repo.get_record(captcha_record_id)
    if not record:
        return 404, {"error": "Captcha record not found"}
    return 200, record


def delete_record(admin_token: str | None, captcha_record_id: int) -> tuple[int, dict]:
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}
    ok = captcha_repo.delete_record(captcha_record_id)
    if not ok:
        return 404, {"error": "Captcha record not found"}
    return 200, {"ok": True}
