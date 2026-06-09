from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.api_key import ApiKey


class Tariff(Base):
    __tablename__ = "tariffs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    api_key_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("api_keys.id"), nullable=False, unique=True
    )
    price_create: Mapped[int] = mapped_column(Integer, nullable=False)
    price_reschedule: Mapped[int] = mapped_column(Integer, nullable=False)
    price_create_peak: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_custom_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    api_key: Mapped[ApiKey] = relationship(back_populates="tariff")
