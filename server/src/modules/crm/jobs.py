"""Durable CRM enrichment jobs for usage rows.

Usage registration stores only the minimal core row. This module owns parsing
company, FIO, vehicle, test markers, and company creation so CRM failures are
retried by the worker instead of breaking `/register-usage`.
"""

from __future__ import annotations

import json
from typing import Any

from src.db.connection import get_connection


def enrich_usage(payload: dict[str, Any]) -> None:
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


def register_jobs(registry) -> None:
    """Register CRM handlers in the platform worker registry."""

    registry.register("crm.enrich_usage", enrich_usage)
    registry.register("usage_enrich", enrich_usage)

