"""Usage-log persistence facade.

This module intentionally wraps the legacy DB functions instead of moving SQL
all at once. New code should depend on this repository boundary.
"""

from src.db import (
    confirm_usage as db_confirm_usage,
    delete_usage_log as db_delete_usage_log,
    fail_usage as db_fail_usage,
    get_key_record as db_get_key_record,
    get_usage_log_entry as db_get_usage_log_entry,
    list_usages as db_list_usages,
    log_usage as db_log_usage,
    validate_key as db_validate_key,
)


def validate_api_key(api_key: str) -> dict:
    return db_validate_key(api_key)


def get_key_record(api_key: str) -> dict | None:
    return db_get_key_record(api_key)


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


def get_usage(usage_log_id: int) -> dict | None:
    return db_get_usage_log_entry(usage_log_id)


def list_usage(api_key_id: int | None = None) -> list[dict]:
    return db_list_usages(api_key_id)


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
