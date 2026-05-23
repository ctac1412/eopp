from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.payout import PayoutExpense
    from src.entities.user import User


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False, default="")
    comment: Mapped[str | None] = mapped_column(Text, nullable=True, default="")
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped[User | None] = relationship(back_populates="expenses")
    payout_links: Mapped[list[PayoutExpense]] = relationship(back_populates="expense")
