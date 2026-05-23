from src.db import check_admin_token
from src.entities import ApiKey
from src.repositories import api_key_repo, usage_log_repo


def authorize_broadcast(admin_token: str | None) -> tuple[int, dict] | None:
    if admin_token and check_admin_token(admin_token):
        return None
    return 401, {"error": "Unauthorized"}


def validate_captcha_api_key(api_key: str) -> tuple[int, dict] | ApiKey:
    validation = api_key_repo.validate_api_key(api_key)
    if not validation["valid"]:
        return 403, {"error": "Invalid API key", "reason": validation["reason"]}

    key_record = api_key_repo.get_key_record(api_key)
    if not key_record:
        return 403, {"error": "Invalid API key", "reason": "Key not found"}
    return key_record


def get_or_create_usage_log(
    usage_log_id: int | None,
    api_key: str,
    reservation_id: str,
    captcha_id: str,
) -> int:
    if usage_log_id:
        return usage_log_id
    return usage_log_repo.create_usage(
        api_key=api_key,
        reservation_id=reservation_id,
        captcha_id=captcha_id,
    )


def verify_usage_log_matches_captcha(usage_log_id: int, captcha_id: str) -> bool:
    log_entry = usage_log_repo.get_usage(usage_log_id)
    return bool(log_entry and log_entry.captcha_id == captcha_id)
