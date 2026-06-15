"""Invoice service."""

import logging
from datetime import datetime

from src.db.invoices import InvoiceDeleteConflict
from src.repositories import company_repo, invoice_repo, usage_log_repo


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


def generate_invoice(body) -> tuple[int, dict]:
    from src.db.connection import get_connection
    from src.db.finance import link_usage_entries_to_invoice

    usage_logs = [
        log for log_id in body.usage_log_ids if (log := usage_log_repo.get_usage_log(log_id))
    ]
    if not usage_logs:
        return 400, {"error": "No valid usage logs provided"}

    debt_amount = body.debt_amount or 0
    percent_amount = body.percent_amount or 0
    tax_amount = body.tax_amount or 0
    total_amount = body.total_amount or (debt_amount + percent_amount + tax_amount)
    invoice_number = f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    invoice_id = None

    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.execute(
            """
            INSERT INTO invoices (
                invoice_number, is_open, comment, percent_rate, tax_rate,
                debt_amount, percent_amount, tax_amount, total_amount, pdf_path, paid
            ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, '', 0)
            """,
            (
                invoice_number,
                body.comment,
                body.percent_rate,
                body.tax_rate,
                debt_amount,
                percent_amount,
                tax_amount,
                total_amount,
            ),
        )
        invoice_id = int(cur.lastrowid)
        placeholders = ",".join("?" * len(body.usage_log_ids))
        conn.execute(
            f"UPDATE usage_log SET invoice_id = ?, paid = 0 WHERE id IN ({placeholders})",
            [invoice_id, *body.usage_log_ids],
        )
        link_usage_entries_to_invoice(
            conn,
            invoice_id,
            body.usage_log_ids,
            percent_amount=percent_amount,
            tax_amount=tax_amount,
        )
        conn.commit()
    except Exception as exc:
        conn.execute("ROLLBACK")
        logging.warning("Failed to save invoice to DB: %s", exc)
        return 400, {"error": str(exc)}
    finally:
        conn.close()

    return 200, {
        "ok": True,
        "invoice_number": invoice_number,
        "invoice_id": invoice_id,
        "debt_amount": debt_amount,
        "percent_amount": percent_amount,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
    }


def _company_name_for_scope(company_id: int | None) -> str | None:
    if company_id is None:
        return None
    company = company_repo.get_company(company_id)
    return company.name if company else None


def list_invoices(company_id: int | None = None) -> tuple[int, list[dict]]:
    return 200, invoice_repo.list_invoices(
        limit=200,
        company_name=_company_name_for_scope(company_id),
    )


def create_invoice(body) -> tuple[int, dict]:
    debt, calc_percent, calc_tax, calc_total = _invoice_totals(body)
    invoice_number = body.invoice_number or f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    return 200, invoice_repo.create_invoice_with_items(
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
        result = invoice_repo.set_invoice_paid(invoice_id, body.paid)
        if not result:
            return 404, {"error": "Invoice not found"}
        return 200, result

    if body.items is not None:
        items_total = sum(item.get("amount", 0) for item in body.items)
        debt, calc_percent, calc_tax, calc_total = _updated_invoice_totals(body, items_total)
        result = invoice_repo.update_invoice(
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
        invoice_repo.replace_invoice_items(invoice_id, body.items)
        result["items"] = body.items
        return 200, result

    result = invoice_repo.update_invoice(
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
    try:
        deleted = invoice_repo.delete_invoice(invoice_id)
    except InvoiceDeleteConflict:
        return 409, {"error": "Invoice is linked to payout or locked finance entries"}
    if not deleted:
        return 404, {"error": "Invoice not found"}
    return 200, {"ok": True}


def ensure_open_invoice(company: str) -> tuple[int, dict]:
    if not company:
        return 400, {"error": "company required"}
    return 200, invoice_repo.ensure_open_invoice(company)


def issue_open_invoice(company: str, comment: str = "") -> tuple[int, dict]:
    from src.repositories import company_billing_repo

    if not company:
        return 400, {"error": "company required"}
    settings = company_billing_repo.get_company_billing_settings(company)
    result = invoice_repo.issue_open_invoice(
        company, comment, reopen=bool(settings.auto_invoice_reopen)
    )
    if not result:
        return 404, {"error": "Open invoice not found"}
    return 200, result


def available_resources(company_id: int | None = None) -> tuple[int, dict]:
    from src.repositories import expense_repo

    company_name = _company_name_for_scope(company_id)
    invoices = invoice_repo.list_available_invoices(limit=1000, company_name=company_name)
    expenses = expense_repo.list_expenses(company_id=company_id)
    return 200, {
        "invoices": [
            invoice
            for invoice in invoices
            if invoice.get("allocation", {}).get("status") != "fully_allocated"
        ],
        "expenses": [
            expense
            for expense in expenses
            if expense.get("allocation", {}).get("status") != "fully_allocated"
        ],
    }
