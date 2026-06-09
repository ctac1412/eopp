from datetime import UTC, datetime

from src.db.expenses import (
    get_total_expenses as db_get_total_expenses,
)
from src.db.expenses import (
    list_expenses as db_list_expenses,
)
from src.entities import Expense, get_session


def list_expenses() -> list[dict]:
    return db_list_expenses()


def get_total_expenses() -> int:
    return db_get_total_expenses()


def create_expense(amount: int, reason: str, user_id: int | None, comment: str = "") -> Expense:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        expense = Expense(
            amount=amount, reason=reason, comment=comment, user_id=user_id, created_at=now
        )
        session.add(expense)
        session.commit()
        session.refresh(expense)
        return expense


def update_expense(expense_id: int, body) -> Expense | None:
    with get_session() as session:
        expense = session.get(Expense, expense_id)
        if not expense:
            return None
        if body.amount is not None:
            expense.amount = body.amount
        if body.reason is not None:
            expense.reason = body.reason
        if body.comment is not None:
            expense.comment = body.comment
        if body.user_id is not None:
            expense.user_id = body.user_id
        if body.created_at is not None:
            expense.created_at = body.created_at
        session.commit()
        session.refresh(expense)
        return expense


def delete_expense(expense_id: int) -> bool:
    with get_session() as session:
        expense = session.get(Expense, expense_id)
        if not expense:
            return False
        session.delete(expense)
        session.commit()
        return True
