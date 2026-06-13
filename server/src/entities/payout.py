from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.expense import Expense
    from src.entities.invoice import Invoice
    from src.entities.user import User


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    completed_at: Mapped[str | None] = mapped_column(Text, nullable=True)

    shares: Mapped[list[PayoutShare]] = relationship(back_populates="payout")
    invoice_links: Mapped[list[PayoutInvoice]] = relationship(back_populates="payout")
    expense_links: Mapped[list[PayoutExpense]] = relationship(back_populates="payout")


class PayoutShare(Base):
    __tablename__ = "payout_shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    payout_id: Mapped[int] = mapped_column(Integer, ForeignKey("payouts.id"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    split_pct: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    expenses_compensation: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    profit_share: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    total: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    commission_amount: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    tax_amount: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    operator_icons: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    operator_amount: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    executor_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    executor_amount: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)

    payout: Mapped[Payout] = relationship(back_populates="shares")
    user: Mapped[User | None] = relationship(back_populates="payout_shares")


class PayoutInvoice(Base):
    __tablename__ = "payout_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    payout_id: Mapped[int] = mapped_column(Integer, ForeignKey("payouts.id"), nullable=False)
    invoice_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("invoices.id"), nullable=True
    )
    amount: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)

    payout: Mapped[Payout] = relationship(back_populates="invoice_links")
    invoice: Mapped[Invoice | None] = relationship(back_populates="payout_links")


class PayoutExpense(Base):
    __tablename__ = "payout_expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    payout_id: Mapped[int] = mapped_column(Integer, ForeignKey("payouts.id"), nullable=False)
    expense_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("expenses.id"), nullable=True
    )
    amount: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)

    payout: Mapped[Payout] = relationship(back_populates="expense_links")
    expense: Mapped[Expense | None] = relationship(back_populates="payout_links")
