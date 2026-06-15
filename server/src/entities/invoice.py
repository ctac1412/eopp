from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.payout import PayoutInvoice
    from src.entities.usage_log import UsageLog
    from src.entities.user import User


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    company: Mapped[str | None] = mapped_column(String, nullable=True)
    is_open: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True, default="")
    percent_rate: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    tax_rate: Mapped[float | None] = mapped_column(Float, nullable=True, default=0)
    debt_amount: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    percent_amount: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    tax_amount: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    total_amount: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    created_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    tax_commission_mode: Mapped[str | None] = mapped_column(String, nullable=True, default="added")
    commission_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    tax_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    usage_logs: Mapped[list[UsageLog]] = relationship(back_populates="invoice_rel")
    items: Mapped[list[InvoiceItem]] = relationship(
        back_populates="invoice", order_by="InvoiceItem.sort_order"
    )
    payout_links: Mapped[list[PayoutInvoice]] = relationship(back_populates="invoice")
    commission_user: Mapped[User | None] = relationship(
        foreign_keys=[commission_user_id], back_populates="commission_invoices"
    )
    tax_user: Mapped[User | None] = relationship(
        foreign_keys=[tax_user_id], back_populates="tax_invoices"
    )


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(Integer, ForeignKey("invoices.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)

    invoice: Mapped[Invoice] = relationship(back_populates="items")
