"""Admin billing workflow rules."""

import logging
from datetime import datetime

from src.repositories import billing_repo


def _invoice_totals(body) -> tuple[int, int, int, int]:
    items_total = sum(item.get("amount", 0) for item in (body.items or []))
    debt = body.debt_amount or items_total
    combined_rate = body.percent_rate + body.tax_rate
    divisor = 1 - combined_rate / 100 if combined_rate < 100 else 0
    total = round(debt / divisor) if divisor > 0 else debt
    percent = round(total * body.percent_rate / 100)
    tax = round(total * body.tax_rate / 100)
    return debt, percent, tax, total


def _updated_invoice_totals(body, items_total: int) -> tuple[int, int, int, int]:
    debt = body.debt_amount if body.debt_amount is not None else items_total
    percent_rate = body.percent_rate if body.percent_rate is not None else 0
    tax_rate = body.tax_rate if body.tax_rate is not None else 0
    combined_rate = percent_rate + tax_rate
    divisor = 1 - combined_rate / 100 if combined_rate < 100 else 0
    total = round(debt / divisor) if divisor > 0 else debt
    percent = round(total * percent_rate / 100)
    tax = round(total * tax_rate / 100)
    return debt, percent, tax, total


def get_tariff(api_key_id: int) -> tuple[int, dict]:
    tariff = billing_repo.get_tariff(api_key_id)
    if not tariff:
        return 404, {"error": "Tariff not found"}
    return 200, tariff


def upsert_tariff(api_key_id: int, body) -> tuple[int, dict]:
    return 200, billing_repo.upsert_tariff(
        api_key_id,
        body.price_create,
        body.price_reschedule,
        body.price_create_peak,
    )


def delete_tariff(api_key_id: int) -> tuple[int, dict]:
    if not billing_repo.delete_tariff(api_key_id):
        return 404, {"error": "Tariff not found"}
    return 200, {"ok": True}


def update_api_key(api_key_id: int, body) -> tuple[int, dict]:
    key = billing_repo.update_api_key(api_key_id, body)
    if not key:
        return 404, {"error": "API key not found"}
    return 200, key


def update_usage_log(usage_log_id: int, body) -> tuple[int, dict]:
    log = billing_repo.update_usage_log(usage_log_id, body)
    if not log:
        return 404, {"error": "Usage log not found"}
    return 200, log


def generate_invoice(body) -> tuple[int, dict]:
    usage_logs = [log for log_id in body.usage_log_ids if (log := billing_repo.get_usage_log(log_id))]
    if not usage_logs:
        return 400, {"error": "No valid usage logs provided"}

    debt_amount = body.debt_amount or 0
    percent_amount = body.percent_amount or 0
    tax_amount = body.tax_amount or 0
    total_amount = body.total_amount or (debt_amount + percent_amount + tax_amount)
    invoice_number = f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    invoice_id = None

    try:
        invoice_id = billing_repo.create_invoice_record(
            invoice_number=invoice_number,
            pdf_path="",
            comment=body.comment,
            percent_rate=body.percent_rate,
            tax_rate=body.tax_rate,
            debt_amount=debt_amount,
            percent_amount=percent_amount,
            tax_amount=tax_amount,
            total_amount=total_amount,
            paid=False,
        )
        billing_repo.link_usage_logs_to_invoice(invoice_id, body.usage_log_ids)
    except Exception as exc:
        logging.warning("Failed to save invoice to DB: %s", exc)

    return 200, {
        "ok": True,
        "invoice_number": invoice_number,
        "invoice_id": invoice_id,
        "debt_amount": debt_amount,
        "percent_amount": percent_amount,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
    }


def list_invoices() -> tuple[int, list[dict]]:
    return 200, billing_repo.list_invoices(limit=200)


def create_invoice(body) -> tuple[int, dict]:
    debt, calc_percent, calc_tax, calc_total = _invoice_totals(body)
    invoice_number = body.invoice_number or f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    return 200, billing_repo.create_invoice_with_items(
        invoice_number=invoice_number,
        comment=body.comment,
        percent_rate=body.percent_rate,
        tax_rate=body.tax_rate,
        debt_amount=debt,
        percent_amount=body.percent_amount or calc_percent,
        tax_amount=body.tax_amount or calc_tax,
        total_amount=body.total_amount or calc_total,
        paid=False,
        items=body.items,
        commission_user_id=body.commission_user_id,
        tax_user_id=body.tax_user_id,
    )


def update_invoice(invoice_id: int, body) -> tuple[int, dict]:
    if body.paid is not None:
        result = billing_repo.set_invoice_paid(invoice_id, body.paid)
        if not result:
            return 404, {"error": "Invoice not found"}
        return 200, result

    if body.items is not None:
        items_total = sum(item.get("amount", 0) for item in body.items)
        debt, calc_percent, calc_tax, calc_total = _updated_invoice_totals(body, items_total)
        result = billing_repo.update_invoice(
            invoice_id,
            comment=body.comment,
            percent_rate=body.percent_rate,
            tax_rate=body.tax_rate,
            debt_amount=debt,
            percent_amount=body.percent_amount or calc_percent,
            tax_amount=body.tax_amount or calc_tax,
            total_amount=body.total_amount or calc_total,
            commission_user_id=body.commission_user_id,
            tax_user_id=body.tax_user_id,
        )
        if not result:
            return 404, {"error": "Invoice not found"}
        billing_repo.replace_invoice_items(invoice_id, body.items)
        result["items"] = body.items
        return 200, result

    result = billing_repo.update_invoice(
        invoice_id,
        comment=body.comment,
        percent_rate=body.percent_rate,
        tax_rate=body.tax_rate,
        debt_amount=body.debt_amount,
        percent_amount=body.percent_amount,
        tax_amount=body.tax_amount,
        total_amount=body.total_amount,
        commission_user_id=body.commission_user_id,
        tax_user_id=body.tax_user_id,
    )
    if not result:
        return 404, {"error": "Invoice not found"}
    return 200, result


def delete_invoice(invoice_id: int) -> tuple[int, dict]:
    if not billing_repo.delete_invoice(invoice_id):
        return 404, {"error": "Invoice not found"}
    return 200, {"ok": True}


def ensure_open_invoice(company: str) -> tuple[int, dict]:
    if not company:
        return 400, {"error": "company required"}
    return 200, billing_repo.ensure_open_invoice(company)


def issue_open_invoice(company: str, comment: str = "") -> tuple[int, dict]:
    if not company:
        return 400, {"error": "company required"}
    settings = billing_repo.get_company_billing_settings(company)
    result = billing_repo.issue_open_invoice(
        company,
        comment,
        reopen=bool(settings.get("auto_invoice_reopen")),
    )
    if not result:
        return 404, {"error": "Open invoice not found"}
    return 200, result


def list_company_billing_settings() -> tuple[int, list[dict]]:
    return 200, billing_repo.list_company_billing_settings()


def update_company_billing_settings(company: str, body: dict) -> tuple[int, dict]:
    if not company:
        return 400, {"error": "company required"}
    auto_invoice_reopen = bool((body or {}).get("auto_invoice_reopen", False))
    return 200, billing_repo.upsert_company_billing_settings(company, auto_invoice_reopen)


def list_company_aliases() -> tuple[int, list[dict]]:
    return 200, billing_repo.list_company_aliases()


def upsert_company_alias(body: dict) -> tuple[int, dict]:
    alias = (body or {}).get("alias", "")
    company = (body or {}).get("company", "")
    if not isinstance(alias, str) or not alias.strip():
        return 400, {"error": "alias required"}
    if not isinstance(company, str) or not company.strip():
        return 400, {"error": "company required"}
    return 200, billing_repo.upsert_company_alias(alias, company)


def delete_company_alias(alias: str) -> tuple[int, dict]:
    if not alias:
        return 400, {"error": "alias required"}
    if not billing_repo.delete_company_alias(alias):
        return 404, {"error": "Company alias not found"}
    return 200, {"ok": True}


def list_expenses() -> tuple[int, dict]:
    return 200, {
        "expenses": billing_repo.list_expenses(),
        "total": billing_repo.get_total_expenses(),
    }


def create_expense(body) -> tuple[int, dict]:
    return 200, billing_repo.create_expense(body.amount, body.reason, body.user_id, body.comment)


def update_expense(expense_id: int, body) -> tuple[int, dict]:
    expense = billing_repo.update_expense(expense_id, body)
    if not expense:
        return 404, {"error": "Expense not found"}
    return 200, expense


def delete_expense(expense_id: int) -> tuple[int, dict]:
    if not billing_repo.delete_expense(expense_id):
        return 404, {"error": "Expense not found"}
    return 200, {"ok": True}


def list_payouts() -> tuple[int, list[dict]]:
    return 200, billing_repo.list_payouts()


def preview_payout(body) -> tuple[int, dict]:
    if not body.user_splits:
        return 400, {"error": "user_splits обязателен"}
    return 200, billing_repo.preview_payout(body.invoice_ids or [], body.expense_ids or [], body.user_splits)


def available_resources() -> tuple[int, dict]:
    invoices = billing_repo.list_available_invoices(limit=1000)
    expenses = billing_repo.list_expenses()
    return 200, {
        "invoices": [
            invoice for invoice in invoices
            if invoice.get("allocation", {}).get("status") != "fully_allocated"
        ],
        "expenses": [
            expense for expense in expenses
            if expense.get("allocation", {}).get("status") != "fully_allocated"
        ],
    }


def _validate_payout_payload(body) -> tuple[int, dict] | None:
    if not body.user_splits:
        return 400, {"error": "user_splits обязателен"}
    if not body.invoice_ids and not body.expense_ids:
        return 400, {"error": "нужен хотя бы один invoice_id или expense_id"}
    return None


def create_payout(body) -> tuple[int, dict]:
    invalid = _validate_payout_payload(body)
    if invalid:
        return invalid
    return 200, billing_repo.create_payout_with_calculation(
        body.name,
        body.invoice_ids or [],
        body.expense_ids or [],
        body.user_splits,
    )


def update_payout(payout_id: int, body) -> tuple[int, dict]:
    if body.name is None:
        return 400, {"error": "name required"}
    payout = billing_repo.update_payout(payout_id, body.name)
    if not payout:
        return 404, {"error": "Payout not found or not editable"}
    return 200, payout


def set_payout_status(payout_id: int, body) -> tuple[int, dict]:
    payout = billing_repo.set_payout_status(payout_id, body.status)
    if not payout:
        return 404, {"error": "Payout not found or not editable"}
    return 200, payout


def delete_payout(payout_id: int) -> tuple[int, dict]:
    if not billing_repo.delete_payout(payout_id):
        return 404, {"error": "Payout not found or not deletable"}
    return 200, {"ok": True}


def recalculate_payout(payout_id: int, body) -> tuple[int, dict]:
    invalid = _validate_payout_payload(body)
    if invalid:
        return invalid
    payout = billing_repo.recalculate_payout(
        payout_id,
        body.invoice_ids or [],
        body.expense_ids or [],
        body.user_splits,
    )
    if not payout:
        return 404, {"error": "Payout not found or not editable"}
    return 200, payout


def list_users() -> tuple[int, list[dict]]:
    return 200, billing_repo.list_users()


def create_user(body) -> tuple[int, dict]:
    return 200, billing_repo.create_user(body.name)


def update_user(user_id: int, body) -> tuple[int, dict]:
    user = billing_repo.update_user(user_id, body.name)
    if not user:
        return 404, {"error": "User not found"}
    return 200, user


def delete_user(user_id: int) -> tuple[int, dict]:
    if not billing_repo.delete_user(user_id):
        return 404, {"error": "User not found"}
    return 200, {"ok": True}


def list_prepaid_packages() -> tuple[int, list[dict]]:
    return 200, billing_repo.list_prepaid_packages()


def create_prepaid_package(body: dict) -> tuple[int, dict]:
    api_key_id = body.get("api_key_id")
    balance_amount = body.get("balance_amount")
    active = body.get("active", True)
    if not isinstance(api_key_id, int):
        return 400, {"error": "api_key_id required"}
    if not isinstance(balance_amount, int) or balance_amount < 0:
        return 400, {"error": "balance_amount must be non-negative integer"}
    return 200, billing_repo.create_prepaid_package(api_key_id, balance_amount, bool(active))


def update_prepaid_package(package_id: int, body: dict) -> tuple[int, dict]:
    balance_amount = body.get("balance_amount")
    active = body.get("active")
    if balance_amount is not None and (not isinstance(balance_amount, int) or balance_amount < 0):
        return 400, {"error": "balance_amount must be non-negative integer"}
    if active is not None and not isinstance(active, bool):
        return 400, {"error": "active must be boolean"}
    updated = billing_repo.update_prepaid_package(package_id, balance_amount, active)
    if not updated:
        return 404, {"error": "Prepaid package not found"}
    return 200, updated


def delete_prepaid_package(package_id: int) -> tuple[int, dict]:
    if not billing_repo.delete_prepaid_package(package_id):
        return 404, {"error": "Prepaid package not found"}
    return 200, {"ok": True}


def top_up_prepaid_package(package_id: int, body: dict) -> tuple[int, dict]:
    amount = (body or {}).get("amount")
    if not isinstance(amount, int) or amount <= 0:
        return 400, {"error": "amount must be positive integer"}
    updated = billing_repo.top_up_prepaid_package(package_id, amount)
    if not updated:
        return 404, {"error": "Prepaid package not found"}
    return 200, updated


def list_prepaid_deductions(package_id: int | None = None, api_key_id: int | None = None) -> tuple[int, list[dict]]:
    return 200, billing_repo.list_prepaid_deductions(package_id=package_id, api_key_id=api_key_id)
