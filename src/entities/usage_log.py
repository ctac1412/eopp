from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.api_key import ApiKey
    from src.entities.captcha import CaptchaRecord
    from src.entities.invoice import Invoice


class UsageLog(Base):
    __tablename__ = "usage_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    api_key_id: Mapped[int] = mapped_column(Integer, ForeignKey("api_keys.id"), nullable=False)
    reservation_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_stage: Mapped[str | None] = mapped_column(Text, nullable=True)
    slot_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    confirmed_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    invoice_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("invoices.id"), nullable=True
    )
    logs: Mapped[str | None] = mapped_column(Text, nullable=True)
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    op_type: Mapped[str | None] = mapped_column(String, nullable=True)
    company: Mapped[str | None] = mapped_column(String, nullable=True)
    fio: Mapped[str | None] = mapped_column(String, nullable=True)
    vehicle_number: Mapped[str | None] = mapped_column(String, nullable=True)
    is_test: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    has_custom_slots: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    invoice_number: Mapped[str | None] = mapped_column(String, nullable=True)

    api_key: Mapped[ApiKey] = relationship(back_populates="usage_logs")
    invoice_rel: Mapped[Invoice | None] = relationship(back_populates="usage_logs")
    captcha_records: Mapped[list[CaptchaRecord]] = relationship(back_populates="usage_log")
