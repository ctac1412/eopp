"""Durable billing jobs for confirmed usage.

The captcha and usage core may enqueue these jobs, but it must not depend on
tariff lookup, prepaid deduction, or invoice linking succeeding. Each handler is
idempotent so a retry after worker failure cannot double-charge prepaid balance
or corrupt invoice links.
"""

from __future__ import annotations

import json
from typing import Any

from src.db.connection import get_connection
from src.platform.jobs.queue import enqueue_deferred_job


def _defer_job(name: str, payload: dict[str, Any]) -> None:
    """Best-effort enqueue for the next finance step."""

    enqueue_deferred_job(name, payload)


def calculate_usage_price(payload: dict[str, Any]) -> None:
    """Calculate and store usage price, then request prepaid deduction."""

    from src.db.finance import create_usage_finance_entries
    from src.db.tariffs import get_effective_tariff
    from src.db.usage_log import _calculate_usage_price

    usage_log_id = int(payload["usage_log_id"])
    conn = get_connection()
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
        if tariff:
            price = _calculate_usage_price(
                mode,
                tariff,
                row["confirmed_at"],
                bool(row["has_custom_slots"]),
            )
        conn.execute("UPDATE usage_log SET price = ? WHERE id = ?", (price, usage_log_id))
        create_usage_finance_entries(conn, usage_log_id, price)
        conn.commit()
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        raise
    finally:
        conn.close()

    _defer_job("billing.deduct_prepaid", {"usage_log_id": usage_log_id})


def deduct_prepaid(payload: dict[str, Any]) -> None:
    """Try prepaid deduction and request invoice linking when unpaid remains."""

    from src.db.prepaid import deduct_prepaid_for_usage_tx

    usage_log_id = int(payload["usage_log_id"])
    conn = get_connection()
    deducted = False
    company = None
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
        from src.db.finance import usage_income_amount

        price = usage_income_amount(conn, usage_log_id)
        if price is None:
            price = int(row["price"] or 0)
        company = row["company"]
        deducted = deduct_prepaid_for_usage_tx(
            conn,
            int(row["api_key_id"]),
            usage_log_id,
            int(price),
        )
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
        _defer_job("billing.link_open_invoice", {"usage_log_id": usage_log_id})


def link_open_invoice(payload: dict[str, Any]) -> None:
    """Attach unpaid confirmed usage to an existing open company invoice."""

    from src.db.invoices import link_usage_to_open_invoice

    usage_log_id = int(payload["usage_log_id"])
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT company, status, is_test FROM usage_log WHERE id = ?",
            (usage_log_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"usage_log {usage_log_id} not found")
        if row["status"] != "confirmed":
            return
        if bool(row["is_test"]) if row["is_test"] is not None else False:
            return
        company = row["company"]
    finally:
        conn.close()

    if company:
        link_usage_to_open_invoice(usage_log_id, company)


def register_jobs(registry) -> None:
    """Register finance handlers in the platform worker registry."""

    registry.register("billing.calculate_usage_price", calculate_usage_price)
    registry.register("billing.deduct_prepaid", deduct_prepaid)
    registry.register("billing.link_open_invoice", link_open_invoice)
    registry.register("billing_confirm", calculate_usage_price)
