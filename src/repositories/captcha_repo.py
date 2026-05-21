"""Captcha-record persistence facade."""

from src.db.captchas import delete_captcha, get_captcha_by_id, list_captchas


def list_records(usage_log_id: int | None = None) -> list[dict]:
    return list_captchas(usage_log_id)


def get_record(captcha_record_id: int) -> dict | None:
    return get_captcha_by_id(captcha_record_id)


def delete_record(captcha_record_id: int) -> bool:
    return delete_captcha(captcha_record_id)
