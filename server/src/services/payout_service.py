"""Payout service."""

from src.repositories import default_payout_split_repo, payout_repo


def list_payouts(company_id: int | None = None) -> tuple[int, list[dict]]:
    return 200, payout_repo.list_payouts(company_id=company_id)


def get_default_payout_splits() -> tuple[int, dict]:
    return 200, {"splits": default_payout_split_repo.list_default_payout_splits()}


def update_default_payout_splits(body) -> tuple[int, dict]:
    return 200, {
        "splits": default_payout_split_repo.replace_default_payout_splits(
            body.splits or []
        )
    }


def preview_payout(body) -> tuple[int, dict]:
    unpaid = _validate_paid_invoices(body.invoice_ids or [])
    if unpaid:
        return unpaid
    return 200, payout_repo.preview_payout(
        body.invoice_ids or [],
        body.expense_ids or [],
        body.user_splits or [],
        body.expense_repayments or [],
    )


def _validate_paid_invoices(invoice_ids: list[int]) -> tuple[int, dict] | None:
    if not invoice_ids:
        return None
    from src.db.connection import get_connection

    placeholders = ",".join("?" * len(invoice_ids))
    conn = get_connection()
    try:
        row = conn.execute(
            f"""
            SELECT COUNT(*) AS unpaid_count
            FROM invoices
            WHERE id IN ({placeholders})
              AND COALESCE(paid, 0) != 1
            """,
            invoice_ids,
        ).fetchone()
    finally:
        conn.close()
    if row and int(row["unpaid_count"] or 0) > 0:
        return 400, {"error": "в выплату можно включать только оплаченные счета"}
    return None


def _validate_payout_payload(body) -> tuple[int, dict] | None:
    if not body.user_splits:
        return 400, {"error": "user_splits обязателен"}
    if not body.invoice_ids and not body.expense_ids and not getattr(body, "expense_repayments", None):
        return 400, {"error": "нужен хотя бы один invoice_id или expense_id"}
    unpaid = _validate_paid_invoices(body.invoice_ids or [])
    if unpaid:
        return unpaid
    if getattr(body, "expense_repayments", None):
        preview = payout_repo.preview_payout(
            body.invoice_ids or [],
            body.expense_ids or [],
            body.user_splits or [],
            body.expense_repayments or [],
        )
        if float(preview.get("net_amount") or 0) < -0.01:
            return 400, {"error": "сумма списаний превышает net выбранной выплаты"}
        from src.db.payouts import validate_expense_repayments_available_profit

        ok, requested, available = validate_expense_repayments_available_profit(
            body.invoice_ids or [],
            body.expense_repayments or [],
        )
        if not ok:
            return 400, {
                "error": (
                    "сумма списаний превышает доступную прибыль выбранных оплаченных счетов "
                    f"({requested:.0f} > {available:.0f})"
                )
            }
    return None


def create_payout(body) -> tuple[int, dict]:
    invalid = _validate_payout_payload(body)
    if invalid:
        return invalid
    try:
        payout = payout_repo.create_payout_with_calculation(
            body.name,
            body.invoice_ids or [],
            body.expense_ids or [],
            body.user_splits,
            body.expense_repayments or [],
        )
    except ValueError as err:
        return 400, {"error": str(err)}
    return 200, payout


def update_payout(payout_id: int, body) -> tuple[int, dict]:
    if body.name is None:
        return 400, {"error": "name required"}
    payout = payout_repo.update_payout(payout_id, body.name)
    if not payout:
        return 404, {"error": "Payout not found or not editable"}
    return 200, payout


def set_payout_status(payout_id: int, body) -> tuple[int, dict]:
    payout = payout_repo.set_payout_status(payout_id, body.status)
    if not payout:
        return 404, {"error": "Payout not found or not editable"}
    return 200, payout


def delete_payout(payout_id: int) -> tuple[int, dict]:
    if not payout_repo.delete_payout(payout_id):
        return 404, {"error": "Payout not found or not deletable"}
    return 200, {"ok": True}


def recalculate_payout(payout_id: int, body) -> tuple[int, dict]:
    invalid = _validate_payout_payload(body)
    if invalid:
        return invalid
    try:
        payout = payout_repo.recalculate_payout(
            payout_id,
            body.invoice_ids or [],
            body.expense_ids or [],
            body.user_splits,
            body.expense_repayments or [],
        )
    except ValueError as err:
        return 400, {"error": str(err)}
    if not payout:
        return 404, {"error": "Payout not found or not editable"}
    return 200, payout
