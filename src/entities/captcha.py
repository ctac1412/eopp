from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.entities.base import Base

if TYPE_CHECKING:
    from src.entities.usage_log import UsageLog


class CaptchaRecord(Base):
    __tablename__ = "captchas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    captcha_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    usage_log_id: Mapped[int] = mapped_column(Integer, ForeignKey("usage_log.id"), nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    tiles_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    correct_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    fail_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    usage_log: Mapped[UsageLog] = relationship(back_populates="captcha_records")
