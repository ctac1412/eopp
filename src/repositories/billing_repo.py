"""Billing persistence facade for admin routes."""

from src.db import (
    create_tariff as db_create_tariff,
)
from src.db import (
    delete_tariff as db_delete_tariff,
)
from src.db import (
    get_tariff as db_get_tariff,
)
from src.db import (
    get_usage_log_entry as db_get_usage_log_entry,
)
from src.db import (
    update_key as db_update_key,
)
from src.db import (
    update_tariff as db_update_tariff,
)
from src.db import (
    update_usage_log as db_update_usage_log,
)
from src.db.company_billing_settings import (
    get_company_billing_settings as db_get_company_billing_settings,
)
from src.db.company_billing_settings import (
    list_company_billing_settings as db_list_company_billing_settings,
)
from src.db.company_billing_settings import (
    upsert_company_billing_settings as db_upsert_company_billing_settings,
)
from src.db.connection import get_connection
from src.db.expenses import (
    create_expense as db_create_expense,
)
from src.db.expenses import (
    delete_expense as db_delete_expense,
)
from src.db.expenses import (
    get_total_expenses as db_get_total_expenses,
)
from src.db.expenses import (
    list_expenses as db_list_expenses,
)
from src.db.expenses import (
    update_expense as db_update_expense,
)
from src.db.invoice_items import add_item, delete_items_for_invoice
from src.db.invoices import (
    delete_invoice as db_delete_invoice,
)
from src.db.invoices import (
    ensure_open_invoice as db_ensure_open_invoice,
)
from src.db.invoices import (
    insert_invoice as db_insert_invoice,
)
from src.db.invoices import (
    insert_invoice_with_items as db_insert_invoice_with_items,
)
from src.db.invoices import (
    issue_open_invoice as db_issue_open_invoice,
)
from src.db.invoices import (
    list_invoices as db_list_invoices,
)
from src.db.invoices import (
    list_invoices_with_items as db_list_invoices_with_items,
)
from src.db.invoices import (
    set_invoice_paid as db_set_invoice_paid,
)
from src.db.invoices import (
    update_invoice as db_update_invoice,
)
from src.db.payouts import (
    create_payout_with_calculation as db_create_payout_with_calculation,
)
from src.db.payouts import (
    delete_payout as db_delete_payout,
)
from src.db.payouts import (
    list_payouts as db_list_payouts,
)
from src.db.payouts import (
    preview_payout as db_preview_payout,
)
from src.db.payouts import (
    recalculate_payout as db_recalculate_payout,
)
from src.db.payouts import (
    set_payout_status as db_set_payout_status,
)
from src.db.payouts import (
    update_payout as db_update_payout,
)
from src.db.prepaid import (
    create_prepaid_package as db_create_prepaid_package,
)
from src.db.prepaid import (
    delete_prepaid_package as db_delete_prepaid_package,
)
from src.db.prepaid import (
    list_prepaid_packages as db_list_prepaid_packages,
)
from src.db.prepaid import (
    update_prepaid_package as db_update_prepaid_package,
)
from src.db.users import (
    create_user as db_create_user,
)
from src.db.users import (
    delete_user as db_delete_user,
)
from src.db.users import (
    list_users as db_list_users,
)
from src.db.users import (
    update_user as db_update_user,
)


def get_tariff(api_key_id: int) -> dict | None:
    return db_get_tariff(api_key_id)


def upsert_tariff(
    api_key_id: int,
    price_create: int,
    price_reschedule: int,
    price_create_peak: int | None = None,
) -> dict:
    if db_get_tariff(api_key_id):
        return db_update_tariff(
            api_key_id,
            price_create,
            price_reschedule,
            price_create_peak,
        )
    return db_create_tariff(
        api_key_id,
        price_create,
        price_reschedule,
        price_create_peak,
    )


def delete_tariff(api_key_id: int) -> bool:
    return db_delete_tariff(api_key_id)


def update_api_key(api_key_id: int, body) -> dict | None:
    return db_update_key(
        api_key_id,
        label=body.label,
        max_uses=body.max_uses,
        active=body.active,
        comment=body.comment,
        is_admin=body.is_admin,
        is_super_kiosk=body.is_super_kiosk,
    )


def update_usage_log(usage_log_id: int, body) -> dict | None:
    return db_update_usage_log(usage_log_id, body.price, body.paid)


def get_usage_log(usage_log_id: int) -> dict | None:
    return db_get_usage_log_entry(usage_log_id)


def create_invoice_record(**kwargs) -> int:
    return db_insert_invoice(**kwargs)


def link_usage_logs_to_invoice(invoice_id: int, usage_log_ids: list[int]) -> None:
    conn = get_connection()
    try:
        for log_id in usage_log_ids:
            conn.execute(
                "UPDATE usage_log SET invoice_id = ?, paid = 0 WHERE id = ?",
                (invoice_id, log_id),
            )
        conn.commit()
    finally:
        conn.close()


def list_invoices(limit: int = 200) -> list[dict]:
    return db_list_invoices_with_items(limit=limit)


def list_available_invoices(limit: int = 1000) -> list[dict]:
    return db_list_invoices(limit=limit)


def create_invoice_with_items(**kwargs) -> dict:
    return db_insert_invoice_with_items(**kwargs)


def update_invoice(invoice_id: int, **kwargs) -> dict | None:
    return db_update_invoice(invoice_id, **kwargs)


def set_invoice_paid(invoice_id: int, paid: bool) -> dict | None:
    return db_set_invoice_paid(invoice_id, paid)


def replace_invoice_items(invoice_id: int, items: list[dict]) -> None:
    delete_items_for_invoice(invoice_id)
    for index, item in enumerate(items):
        add_item(
            invoice_id,
            description=item.get("description", ""),
            amount=item.get("amount", 0),
            sort_order=item.get("sort_order", index),
        )


def delete_invoice(invoice_id: int) -> bool:
    return db_delete_invoice(invoice_id)


def ensure_open_invoice(company: str) -> dict:
    return db_ensure_open_invoice(company)


def issue_open_invoice(company: str, comment: str = "", reopen: bool = False) -> dict | None:
    return db_issue_open_invoice(company, comment, reopen)


def list_company_billing_settings() -> list[dict]:
    return db_list_company_billing_settings()


def get_company_billing_settings(company: str) -> dict:
    return db_get_company_billing_settings(company)


def upsert_company_billing_settings(company: str, auto_invoice_reopen: bool) -> dict:
    return db_upsert_company_billing_settings(company, auto_invoice_reopen)


def list_expenses() -> list[dict]:
    return db_list_expenses()


def get_total_expenses() -> int:
    return db_get_total_expenses()


def create_expense(amount: int, reason: str, user_id: int | None, comment: str = "") -> dict:
    return db_create_expense(amount, reason, user_id, comment)


def update_expense(expense_id: int, body) -> dict | None:
    return db_update_expense(expense_id, body.amount, body.reason, body.comment, body.user_id, body.created_at)


def delete_expense(expense_id: int) -> bool:
    return db_delete_expense(expense_id)


def list_payouts() -> list[dict]:
    return db_list_payouts()


def preview_payout(invoice_ids: list[int], expense_ids: list[int], user_splits: list[dict]) -> dict:
    return db_preview_payout(invoice_ids, expense_ids, user_splits)


def create_payout_with_calculation(name: str, invoice_ids: list[int], expense_ids: list[int], user_splits: list[dict]) -> dict:
    return db_create_payout_with_calculation(name, invoice_ids, expense_ids, user_splits)


def update_payout(payout_id: int, name: str) -> dict | None:
    return db_update_payout(payout_id, name)


def set_payout_status(payout_id: int, status: str) -> dict | None:
    return db_set_payout_status(payout_id, status)


def delete_payout(payout_id: int) -> bool:
    return db_delete_payout(payout_id)


def recalculate_payout(payout_id: int, invoice_ids: list[int], expense_ids: list[int], user_splits: list[dict]) -> dict | None:
    return db_recalculate_payout(payout_id, invoice_ids, expense_ids, user_splits)


def list_users() -> list[dict]:
    return db_list_users()


def create_user(name: str) -> dict:
    return db_create_user(name)


def update_user(user_id: int, name: str) -> dict | None:
    return db_update_user(user_id, name)


def delete_user(user_id: int) -> bool:
    return db_delete_user(user_id)


def list_prepaid_packages() -> list[dict]:
    return db_list_prepaid_packages()


def create_prepaid_package(api_key_id: int, balance_amount: int, active: bool = True) -> dict:
    return db_create_prepaid_package(api_key_id, balance_amount, active)


def update_prepaid_package(
    package_id: int,
    balance_amount: int | None = None,
    active: bool | None = None,
) -> dict | None:
    return db_update_prepaid_package(package_id, balance_amount, active)


def delete_prepaid_package(package_id: int) -> bool:
    return db_delete_prepaid_package(package_id)
