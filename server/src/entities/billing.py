from __future__ import annotations

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.entities.base import Base


class CompanyBillingSetting(Base):
    __tablename__ = "company_billing_settings"

    company: Mapped[str] = mapped_column(String, primary_key=True)
    auto_invoice_reopen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tax_commission_mode: Mapped[str] = mapped_column(String, nullable=False, default="added")
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True)


class CompanyAlias(Base):
    __tablename__ = "company_aliases"

    alias: Mapped[str] = mapped_column(String, primary_key=True)
    company: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)
