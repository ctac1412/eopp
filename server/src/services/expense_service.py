"""Expense service."""

from src.entities.utils import entity_to_dict
from src.repositories import expense_repo


def list_expenses() -> tuple[int, dict]:
    return 200, {
        "expenses": expense_repo.list_expenses(),
        "total": expense_repo.get_total_expenses(),
    }


def create_expense(body) -> tuple[int, dict]:
    return 200, entity_to_dict(
        expense_repo.create_expense(body.amount, body.reason, body.user_id, body.comment)
    )


def update_expense(expense_id: int, body) -> tuple[int, dict]:
    expense = expense_repo.update_expense(expense_id, body)
    if not expense:
        return 404, {"error": "Expense not found"}
    return 200, entity_to_dict(expense)


def delete_expense(expense_id: int) -> tuple[int, dict]:
    if not expense_repo.delete_expense(expense_id):
        return 404, {"error": "Expense not found"}
    return 200, {"ok": True}
