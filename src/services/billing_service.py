"""Billing service facade — re-exports all domain services."""

from src.entities.utils import entity_to_dict
from src.repositories import api_key_repo, usage_log_repo
from src.services.company_service import (
    delete_company_alias,
    list_company_aliases,
    list_company_billing_settings,
    update_company_billing_settings,
    upsert_company_alias,
)
from src.services.expense_service import (
    create_expense,
    delete_expense,
    list_expenses,
    update_expense,
)
from src.services.invoice_service import (
    available_resources,
    create_invoice,
    delete_invoice,
    ensure_open_invoice,
    generate_invoice,
    issue_open_invoice,
    list_invoices,
    update_invoice,
)
from src.services.payout_service import (
    create_payout,
    delete_payout,
    list_payouts,
    preview_payout,
    recalculate_payout,
    set_payout_status,
    update_payout,
)
from src.services.prepaid_service import (
    create_prepaid_package,
    delete_prepaid_package,
    list_prepaid_deductions,
    list_prepaid_packages,
    top_up_prepaid_package,
    update_prepaid_package,
)
from src.services.tariff_service import (
    delete_tariff,
    get_tariff,
    upsert_tariff,
)
from src.services.user_service import (
    create_user,
    delete_user,
    list_users,
    update_user,
)


def update_api_key(api_key_id: int, body) -> tuple[int, dict]:
    key = api_key_repo.update_api_key(api_key_id, body)
    if not key:
        return 404, {"error": "API key not found"}
    return 200, entity_to_dict(key)


def update_usage_log(usage_log_id: int, body) -> tuple[int, dict]:
    log = usage_log_repo.update_usage_log(
        usage_log_id,
        price=body.price,
        paid=body.paid,
    )
    if not log:
        return 404, {"error": "Usage log not found"}
    return 200, log


__all__ = [
    "update_api_key",
    "update_usage_log",
    "available_resources",
    "create_expense",
    "create_invoice",
    "create_payout",
    "create_prepaid_package",
    "create_user",
    "delete_company_alias",
    "delete_expense",
    "delete_invoice",
    "delete_payout",
    "delete_prepaid_package",
    "delete_tariff",
    "delete_user",
    "ensure_open_invoice",
    "generate_invoice",
    "get_tariff",
    "issue_open_invoice",
    "list_company_aliases",
    "list_company_billing_settings",
    "list_expenses",
    "list_invoices",
    "list_payouts",
    "list_prepaid_deductions",
    "list_prepaid_packages",
    "list_users",
    "preview_payout",
    "recalculate_payout",
    "set_payout_status",
    "top_up_prepaid_package",
    "update_company_billing_settings",
    "update_expense",
    "update_invoice",
    "update_payout",
    "update_prepaid_package",
    "upsert_tariff",
    "update_user",
    "upsert_company_alias",
    "upsert_tariff",
]
