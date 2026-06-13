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


def list_payouts(company_id: int | None = None) -> list[dict]:
    return db_list_payouts(company_id=company_id)


def preview_payout(invoice_ids: list[int], expense_ids: list[int], user_splits: list[dict]) -> dict:
    return db_preview_payout(invoice_ids, expense_ids, user_splits)


def create_payout_with_calculation(
    name: str, invoice_ids: list[int], expense_ids: list[int], user_splits: list[dict]
) -> dict:
    return db_create_payout_with_calculation(name, invoice_ids, expense_ids, user_splits)


def update_payout(payout_id: int, name: str) -> dict | None:
    return db_update_payout(payout_id, name)


def set_payout_status(payout_id: int, status: str) -> dict | None:
    return db_set_payout_status(payout_id, status)


def delete_payout(payout_id: int) -> bool:
    return db_delete_payout(payout_id)


def recalculate_payout(
    payout_id: int, invoice_ids: list[int], expense_ids: list[int], user_splits: list[dict]
) -> dict | None:
    return db_recalculate_payout(payout_id, invoice_ids, expense_ids, user_splits)
