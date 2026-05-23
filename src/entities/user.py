from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.expense import Expense
    from src.entities.invoice import Invoice
    from src.entities.payout import PayoutShare


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    expenses: Mapped[list[Expense]] = relationship(back_populates="user")
    payout_shares: Mapped[list[PayoutShare]] = relationship(back_populates="user")
    commission_invoices: Mapped[list[Invoice]] = relationship(
        back_populates="commission_user", foreign_keys="[Invoice.commission_user_id]"
    )
    tax_invoices: Mapped[list[Invoice]] = relationship(
        back_populates="tax_user", foreign_keys="[Invoice.tax_user_id]"
    )
