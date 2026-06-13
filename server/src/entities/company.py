from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.access_profile import (
        CompanyMembership,
        FinanceParticipantProfile,
        MasterProfile,
        OperatorProfile,
    )
    from src.entities.api_key import ApiKey
    from src.entities.operator import Operator
    from src.entities.usage_log import UsageLog
    from src.entities.user import User
    from src.entities.tariff import CompanyTariff


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    aliases: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True)

    api_keys: Mapped[list[ApiKey]] = relationship(back_populates="company")
    operators: Mapped[list[Operator]] = relationship(back_populates="company")
    usage_logs: Mapped[list[UsageLog]] = relationship(back_populates="company_rel")
    users: Mapped[list[User]] = relationship(back_populates="company")
    memberships: Mapped[list[CompanyMembership]] = relationship(back_populates="company")
    master_profiles: Mapped[list[MasterProfile]] = relationship(back_populates="company")
    operator_profiles: Mapped[list[OperatorProfile]] = relationship(back_populates="company")
    finance_profiles: Mapped[list[FinanceParticipantProfile]] = relationship(back_populates="company")
    tariff: Mapped[CompanyTariff | None] = relationship(back_populates="company", uselist=False)
