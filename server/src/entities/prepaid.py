from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    pass


class PrepaidPackage(Base):
    __tablename__ = "prepaid_packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    api_key_id: Mapped[int] = mapped_column(Integer, ForeignKey("api_keys.id"), nullable=False)
    balance_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    deductions: Mapped[list[PrepaidDeduction]] = relationship(back_populates="package")


class PrepaidDeduction(Base):
    __tablename__ = "prepaid_deductions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    package_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("prepaid_packages.id"), nullable=False
    )
    usage_log_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usage_log.id"), nullable=False, unique=True
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    package: Mapped[PrepaidPackage] = relationship(back_populates="deductions")
