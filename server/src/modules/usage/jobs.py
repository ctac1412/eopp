"""Background jobs for usage-owned side work.

Finance and CRM handlers live in ``src.modules.billing`` and ``src.modules.crm``
so tariff, prepaid, invoice, and company parsing failures remain outside core
usage registration and confirmation.
"""

from __future__ import annotations

import json
from typing import Any

from src.db.connection import get_connection


def enrich_usage_config(payload: dict[str, Any]) -> None:
    """Fill denormalized usage fields from the stored injector config."""

    from src.db.usage_log import _calc_is_test, _extract_fields_from_config
    from src.repositories import company_repo

    usage_log_id = int(payload["usage_log_id"])
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
        if row is None:
            raise ValueError(f"usage_log {usage_log_id} not found")
        config_json = json.loads(row["config_json"]) if row["config_json"] else None
        extracted = _extract_fields_from_config(config_json)
        company_obj = company_repo.get_or_create_company(extracted["company"])
        is_test = _calc_is_test(row["reservation_id"], config_json)
        conn.execute(
            """
            UPDATE usage_log
            SET op_type = ?,
                company = ?,
                company_id = ?,
                fio = ?,
                vehicle_number = ?,
                is_test = ?,
                has_custom_slots = ?
            WHERE id = ?
            """,
            (
                extracted["op_type"],
                extracted["company"],
                company_obj.id if company_obj else None,
                extracted["fio"],
                extracted["vehicle_number"],
                is_test,
                int(bool(extracted["has_custom_slots"])),
                usage_log_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def confirm_billing(payload: dict[str, Any]) -> None:
    """Calculate confirmed usage price and apply prepaid/invoice side effects."""

    from src.db.invoices import link_usage_to_open_invoice
    from src.db.finance import create_usage_finance_entries
    from src.db.prepaid import deduct_prepaid_for_usage_tx
    from src.db.tariffs import get_effective_tariff
    from src.db.usage_log import _calculate_usage_price

    usage_log_id = int(payload["usage_log_id"])
    conn = get_connection()
    company = None
    deducted = False
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
        if row is None:
            conn.execute("ROLLBACK")
            raise ValueError(f"usage_log {usage_log_id} not found")
        if row["status"] != "confirmed":
            conn.execute("ROLLBACK")
            return
        if bool(row["is_test"]) if row["is_test"] is not None else False:
            conn.execute("ROLLBACK")
            return
        config_json = json.loads(row["config_json"]) if row["config_json"] else None
        mode = config_json.get("mode", "create") if config_json else "create"
        tariff = get_effective_tariff(row["api_key_id"])
        price = 0
        company = row["company"]
        if tariff:
            price = _calculate_usage_price(
                mode,
                tariff,
                row["confirmed_at"],
                bool(row["has_custom_slots"]),
            )
        conn.execute("UPDATE usage_log SET price = ? WHERE id = ?", (price, usage_log_id))
        create_usage_finance_entries(conn, usage_log_id, price)
        deducted = deduct_prepaid_for_usage_tx(conn, row["api_key_id"], usage_log_id, price)
        conn.commit()
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise
    finally:
        conn.close()
    if company and not deducted:
        link_usage_to_open_invoice(usage_log_id, company)


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
