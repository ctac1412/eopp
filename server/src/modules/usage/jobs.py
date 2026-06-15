"""Background jobs for usage-owned side work.

Finance and CRM handlers live in ``src.modules.billing`` and ``src.modules.crm``.
This module only owns usage-adjacent notifications and captcha record parsing.
"""

from __future__ import annotations

import json
from typing import Any

from src.db.connection import get_connection


def parse_captcha_records(payload: dict[str, Any]) -> None:
    """Parse captcha history records from confirmed usage logs."""

    from src.db.captchas import create_captcha_records
    from src.db.usage_log import _should_index_captchas

    usage_log_id = int(payload["usage_log_id"])
    status = str(payload.get("status") or "confirmed")
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT logs, config_json FROM usage_log WHERE id = ?",
            (usage_log_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"usage_log {usage_log_id} not found")
        logs = json.loads(row["logs"]) if row["logs"] else None
        config_json = json.loads(row["config_json"]) if row["config_json"] else None
    finally:
        conn.close()
    if logs and _should_index_captchas(config_json):
        create_captcha_records(usage_log_id, "unknown", logs, status)


def notify_confirmed_usage(payload: dict[str, Any]) -> None:
    """Send the deferred Telegram notification for a confirmed usage."""

    from src.repositories import usage_log_repo
    from src.services import telegram_service

    usage_log_id = int(payload["usage_log_id"])
    telegram_service.notify_confirmed_usage(usage_log_repo.get_usage_log(usage_log_id))


def register_jobs(registry) -> None:
    """Register usage side-module job handlers in the platform worker registry."""

    registry.register("captcha_records", parse_captcha_records)
    registry.register("telegram_confirmed_usage", notify_confirmed_usage)
