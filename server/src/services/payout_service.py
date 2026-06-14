"""Payout service."""

from src.repositories import payout_repo


def list_payouts(company_id: int | None = None) -> tuple[int, list[dict]]:
    return 200, payout_repo.list_payouts(company_id=company_id)


def preview_payout(body) -> tuple[int, dict]:
    if not body.user_splits:
        return 400, {"error": "user_splits обязателен"}
    return 200, payout_repo.preview_payout(
        body.invoice_ids or [], body.expense_ids or [], body.user_splits
    )


def _validate_payout_payload(body) -> tuple[int, dict] | None:
    if not body.user_splits:
        return 400, {"error": "user_splits обязателен"}
    if not body.invoice_ids and not body.expense_ids and not getattr(body, "expense_repayments", None):
        return 400, {"error": "нужен хотя бы один invoice_id или expense_id"}
    return None


def create_payout(body) -> tuple[int, dict]:
    from src.db.finance import create_expense_repayments
    from src.db.payouts import get_payout_by_id

    invalid = _validate_payout_payload(body)
    if invalid:
        return invalid
    payout = payout_repo.create_payout_with_calculation(
        body.name,
        body.invoice_ids or [],
        body.expense_ids or [],
        body.user_splits,
    )
    if body.expense_repayments:
        create_expense_repayments(payout["id"], body.expense_repayments)
        payout = get_payout_by_id(payout["id"]) or payout
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
    from src.db.finance import create_expense_repayments
    from src.db.payouts import get_payout_by_id

    invalid = _validate_payout_payload(body)
    if invalid:
        return invalid
    payout = payout_repo.recalculate_payout(
        payout_id,
        body.invoice_ids or [],
        body.expense_ids or [],
        body.user_splits,
    )
    if not payout:
        return 404, {"error": "Payout not found or not editable"}
    if body.expense_repayments:
        create_expense_repayments(payout_id, body.expense_repayments)
        payout = get_payout_by_id(payout_id) or payout
    return 200, payout
