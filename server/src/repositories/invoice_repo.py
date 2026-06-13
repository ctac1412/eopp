from src.db.invoice_items import add_item, delete_items_for_invoice
from src.db.invoices import (
    delete_invoice as db_delete_invoice,
)
from src.db.invoices import (
    issue_open_invoice as db_issue_open_invoice,
)


def create_invoice_record(**kwargs) -> int:
    from src.db.invoices import insert_invoice as db_insert_invoice

    return db_insert_invoice(**kwargs)


def list_invoices(limit: int = 200, company_name: str | None = None) -> list[dict]:
    from src.db.invoices import list_invoices_with_items as db_list_invoices_with_items

    return db_list_invoices_with_items(limit=limit, company=company_name)


def list_available_invoices(limit: int = 1000, company_name: str | None = None) -> list[dict]:
    from src.db.invoices import list_invoices as db_list_invoices

    return db_list_invoices(limit=limit, company=company_name)


def create_invoice_with_items(**kwargs) -> dict:
    from src.db.invoices import insert_invoice_with_items as db_insert_invoice_with_items

    return db_insert_invoice_with_items(**kwargs)


def update_invoice(invoice_id: int, **kwargs) -> dict | None:
    from src.db.invoices import update_invoice as db_update_invoice

    return db_update_invoice(invoice_id, **kwargs)


def set_invoice_paid(invoice_id: int, paid: bool) -> dict | None:
    from src.db.invoices import set_invoice_paid as db_set_invoice_paid

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
    from src.db.invoices import ensure_open_invoice as db_ensure_open_invoice

    return db_ensure_open_invoice(company)


def issue_open_invoice(company: str, comment: str = "", reopen: bool = False) -> dict | None:
    return db_issue_open_invoice(company, comment, reopen)
