"""Invoice service."""

import logging
from datetime import datetime
from types import SimpleNamespace

from src.db.invoices import InvoiceDeleteConflict
from src.repositories import company_repo, invoice_repo, usage_log_repo
from src.repositories import company_billing_repo


def _normalize_tax_commission_mode(mode: str | None) -> str:
    return company_billing_repo.normalize_tax_commission_mode(mode)


def _company_tax_commission_mode(company: str | None) -> str:
    if not company:
        return "added"
    settings = company_billing_repo.get_company_billing_settings(company)
    return _normalize_tax_commission_mode(getattr(settings, "tax_commission_mode", None))


def _company_billing_settings(company: str | None):
    if not company:
        return None
    return company_billing_repo.get_company_billing_settings(company)


def _settings_tax_commission_mode(settings) -> str:
    return _normalize_tax_commission_mode(getattr(settings, "tax_commission_mode", None))


def _body_fields(body) -> set[str]:
    fields = getattr(body, "model_fields_set", None)
    if fields is not None:
        return set(fields)
    return set(getattr(body, "__fields_set__", set()))


def _apply_company_invoice_defaults(body, settings) -> None:
    if not settings:
        return
    fields = _body_fields(body)
    if "percent_rate" not in fields:
        body.percent_rate = float(getattr(settings, "default_percent_rate", 0) or 0)
    if "tax_rate" not in fields:
        body.tax_rate = float(getattr(settings, "default_tax_rate", 0) or 0)
    if "commission_user_id" not in fields:
        body.commission_user_id = getattr(settings, "default_commission_user_id", None)
    if "tax_user_id" not in fields:
        body.tax_user_id = getattr(settings, "default_tax_user_id", None)


def _invoice_totals(body, tax_commission_mode: str = "added") -> tuple[int, int, int, int]:
    items_total = sum(item.get("amount", 0) for item in (body.items or []))
    debt = body.debt_amount or items_total
    if tax_commission_mode == "included":
        total = body.total_amount or debt
        percent = round(total * body.percent_rate / 100)
        tax = round(total * body.tax_rate / 100)
        return total, percent, tax, total
    combined_rate = body.percent_rate + body.tax_rate
    divisor = 1 - combined_rate / 100 if combined_rate < 100 else 0
    total = round(debt / divisor) if divisor > 0 else debt
    percent = round(total * body.percent_rate / 100)
    tax = round(total * body.tax_rate / 100)
    return debt, percent, tax, total


def _updated_invoice_totals(
    body, items_total: int, tax_commission_mode: str = "added"
) -> tuple[int, int, int, int]:
    debt = body.debt_amount if body.debt_amount is not None else items_total
    percent_rate = body.percent_rate if body.percent_rate is not None else 0
    tax_rate = body.tax_rate if body.tax_rate is not None else 0
    if tax_commission_mode == "included":
        total = body.total_amount if body.total_amount is not None else debt
        percent = round(total * percent_rate / 100)
        tax = round(total * tax_rate / 100)
        return total, percent, tax, total
    combined_rate = percent_rate + tax_rate
    divisor = 1 - combined_rate / 100 if combined_rate < 100 else 0
    total = round(debt / divisor) if divisor > 0 else debt
    percent = round(total * percent_rate / 100)
    tax = round(total * tax_rate / 100)
    return debt, percent, tax, total


def _recipient_validation_error(body) -> str | None:
    missing = []
    if (body.percent_amount or 0) > 0 and not body.commission_user_id:
        missing.append("commission_user_id")
    if (body.tax_amount or 0) > 0 and not body.tax_user_id:
        missing.append("tax_user_id")
    if missing:
        return f"Required recipient fields missing: {', '.join(missing)}"
    return None


def _generated_invoice_company(usage_logs: list[dict]) -> str | None:
    for log in usage_logs:
        company = log.get("company_name") or log.get("company")
        if company:
            return company
    return None


def _usage_company_key(log: dict) -> tuple[str, object]:
    if log.get("company_id") is not None:
        return ("id", log["company_id"])
    company = log.get("company_name") or log.get("company")
    if company:
        return ("name", str(company).strip().lower())
    return ("unknown", None)


def _mixed_company_error(usage_logs: list[dict]) -> str | None:
    company_keys = {_usage_company_key(log) for log in usage_logs}
    if len(company_keys) > 1:
        return "All usage logs in one invoice must belong to the same company"
    return None


def _generated_invoice_totals(body, usage_logs: list[dict], mode: str) -> tuple[int, int, int, int]:
    usage_total = sum(int(log.get("price") or 0) for log in usage_logs)
    if mode == "included":
        total = body.debt_amount or usage_total or body.total_amount
        percent = round(total * body.percent_rate / 100)
        tax = round(total * body.tax_rate / 100)
        return total, percent, tax, total
    debt = body.debt_amount or usage_total
    percent = body.percent_amount or 0
    tax = body.tax_amount or 0
    total = body.total_amount or (debt + percent + tax)
    return debt, percent, tax, total


def generate_invoice(body) -> tuple[int, dict]:
    from src.db.connection import get_connection
    from src.db.finance import link_usage_entries_to_invoice

    usage_logs = [
        log for log_id in body.usage_log_ids if (log := usage_log_repo.get_usage_log(log_id))
    ]
    if not usage_logs:
        return 400, {"error": "No valid usage logs provided"}
    if error := _mixed_company_error(usage_logs):
        return 400, {"error": error}

    company = _generated_invoice_company(usage_logs)
    company_settings = _company_billing_settings(company)
    _apply_company_invoice_defaults(body, company_settings)
    tax_commission_mode = _settings_tax_commission_mode(company_settings)
    debt_amount, percent_amount, tax_amount, total_amount = _generated_invoice_totals(
        body, usage_logs, tax_commission_mode
    )
    validation_body = SimpleNamespace(
        percent_amount=percent_amount,
        tax_amount=tax_amount,
        commission_user_id=body.commission_user_id,
        tax_user_id=body.tax_user_id,
    )
    if error := _recipient_validation_error(validation_body):
        return 400, {"error": error}
    invoice_number = f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    invoice_id = None

    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.execute(
            """
            INSERT INTO invoices (
                invoice_number, company, is_open, comment, percent_rate, tax_rate,
                debt_amount, percent_amount, tax_amount, total_amount, pdf_path, paid,
                commission_user_id, tax_user_id, tax_commission_mode
            ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)
            """,
            (
                invoice_number,
                company,
                body.comment,
                body.percent_rate,
                body.tax_rate,
                debt_amount,
                percent_amount,
                tax_amount,
                total_amount,
                body.commission_user_id,
                body.tax_user_id,
                tax_commission_mode,
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
            tax_commission_mode=tax_commission_mode,
            commission_user_id=body.commission_user_id,
            tax_user_id=body.tax_user_id,
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
    company = (body.company or "").strip() or None
    company_settings = _company_billing_settings(company)
    _apply_company_invoice_defaults(body, company_settings)
    tax_commission_mode = (
        _settings_tax_commission_mode(company_settings)
        if company_settings
        else _normalize_tax_commission_mode(body.tax_commission_mode)
    )
    debt, calc_percent, calc_tax, calc_total = _invoice_totals(body, tax_commission_mode)
    body.percent_amount = body.percent_amount or calc_percent
    body.tax_amount = body.tax_amount or calc_tax
    if error := _recipient_validation_error(body):
        return 400, {"error": error}
    invoice_number = body.invoice_number or f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    return 200, invoice_repo.create_invoice_with_items(
        invoice_number=invoice_number,
        company=company,
        comment=body.comment,
        percent_rate=body.percent_rate,
        tax_rate=body.tax_rate,
        debt_amount=debt,
        percent_amount=body.percent_amount,
        tax_amount=body.tax_amount,
        total_amount=body.total_amount or calc_total,
        paid=False,
        items=body.items,
        commission_user_id=body.commission_user_id,
        tax_user_id=body.tax_user_id,
        tax_commission_mode=tax_commission_mode,
    )


def update_invoice(invoice_id: int, body) -> tuple[int, dict]:
    if body.paid is not None:
        result = invoice_repo.set_invoice_paid(invoice_id, body.paid)
        if not result:
            return 404, {"error": "Invoice not found"}
        return 200, result

    if body.items is not None:
        items_total = sum(item.get("amount", 0) for item in body.items)
        current = invoice_repo.get_invoice(invoice_id)
        if not current:
            return 404, {"error": "Invoice not found"}
        tax_commission_mode = _normalize_tax_commission_mode(
            body.tax_commission_mode or current.get("tax_commission_mode")
        )
        debt, calc_percent, calc_tax, calc_total = _updated_invoice_totals(
            body, items_total, tax_commission_mode
        )
        body.percent_amount = body.percent_amount or calc_percent
        body.tax_amount = body.tax_amount or calc_tax
        if error := _recipient_validation_error(body):
            return 400, {"error": error}
        result = invoice_repo.update_invoice(
            invoice_id,
            comment=body.comment,
            percent_rate=body.percent_rate,
            tax_rate=body.tax_rate,
            debt_amount=debt,
            percent_amount=body.percent_amount,
            tax_amount=body.tax_amount,
            total_amount=body.total_amount or calc_total,
            commission_user_id=body.commission_user_id,
            tax_user_id=body.tax_user_id,
            tax_commission_mode=tax_commission_mode,
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
        tax_commission_mode=body.tax_commission_mode,
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
            if int(invoice.get("paid") or 0) == 1
            and invoice.get("allocation", {}).get("status") != "fully_allocated"
        ],
        "expenses": [
            expense
            for expense in expenses
            if expense.get("allocation", {}).get("status") != "fully_allocated"
        ],
    }
