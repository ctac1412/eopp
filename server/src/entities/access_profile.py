from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.company import Company
    from src.entities.operator import Operator
    from src.entities.user import User


class CompanyMembership(Base):
    """Company-scoped role for a login user, separate from platform RBAC."""

    __tablename__ = "company_memberships"
    __table_args__ = (UniqueConstraint("user_id", "company_id", name="uq_company_membership_user_company"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="manager")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="company_memberships")
    company: Mapped[Company] = relationship(back_populates="memberships")


class MasterProfile(Base):
    """Functional profile marking a user as a master who may use plugin keys."""

    __tablename__ = "master_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_master_profile_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    scope: Mapped[str] = mapped_column(String, nullable=False, default="own_company")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="master_profile")
    company: Mapped[Company] = relationship(back_populates="master_profiles")


class OperatorProfile(Base):
    """Functional profile linking a login user to the legacy operator runtime row."""

    __tablename__ = "operator_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_operator_profile_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    company_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    operator_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("operators.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="operator_profile")
    company: Mapped[Company] = relationship(back_populates="operator_profiles")
    operator: Mapped[Operator | None] = relationship(back_populates="profile")


class FinanceParticipantProfile(Base):
    """Functional profile for users selectable in invoice and payment flows."""

    __tablename__ = "finance_participant_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_finance_profile_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="finance_profile")
    company: Mapped[Company] = relationship(back_populates="finance_profiles")
