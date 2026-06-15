from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.access_profile import OperatorProfile
    from src.entities.company import Company


class Operator(Base):
    __tablename__ = "operators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uuid: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    nickname: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    icon_display_mode: Mapped[str] = mapped_column(
        Text, nullable=False, default="own_then_foreign"
    )
    icon_rate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    billing_mode: Mapped[str] = mapped_column(Text, nullable=False, default="company")
    allowed_master_keys: Mapped[str | None] = mapped_column(Text, nullable=True)
    online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    company_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("companies.id"), nullable=True
    )

    company: Mapped[Company | None] = relationship(back_populates="operators")
    profile: Mapped[OperatorProfile | None] = relationship(back_populates="operator", uselist=False)


class OperatorMasterLink(Base):
    __tablename__ = "operator_master_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[int] = mapped_column(Integer, nullable=False)
    master_key_id: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
