from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.access_profile import (
        CompanyMembership,
        FinanceParticipantProfile,
        OperatorProfile,
        UserExecutorCompany,
        UserFinanceCompany,
        UserOperatorCompany,
    )
    from src.entities.api_key import ApiKey
    from src.entities.company import Company
    from src.entities.expense import Expense
    from src.entities.invoice import Invoice
    from src.entities.payout import PayoutShare


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    login: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String, nullable=False, default="manager")
    system_role: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_director: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    company_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("companies.id"), nullable=True
    )
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    company: Mapped[Company | None] = relationship(back_populates="users")
    company_memberships: Mapped[list[CompanyMembership]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    operator_profile: Mapped[OperatorProfile | None] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    finance_profile: Mapped[FinanceParticipantProfile | None] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    finance_company_access: Mapped[list[UserFinanceCompany]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    operator_company_access: Mapped[list[UserOperatorCompany]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    executor_company_access: Mapped[list[UserExecutorCompany]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list[ApiKey]] = relationship(back_populates="user")
    expenses: Mapped[list[Expense]] = relationship(back_populates="user")
    payout_shares: Mapped[list[PayoutShare]] = relationship(back_populates="user")
    commission_invoices: Mapped[list[Invoice]] = relationship(
        back_populates="commission_user", foreign_keys="[Invoice.commission_user_id]"
    )
    tax_invoices: Mapped[list[Invoice]] = relationship(
        back_populates="tax_user", foreign_keys="[Invoice.tax_user_id]"
    )
