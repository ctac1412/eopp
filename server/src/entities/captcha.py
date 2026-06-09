from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
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
    fail_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    usage_log: Mapped[UsageLog] = relationship(back_populates="captcha_records")


class CaptchaFile(Base):
    __tablename__ = "captcha_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    captcha_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_status: Mapped[str] = mapped_column(String, nullable=False)
    captcha_type: Mapped[str | None] = mapped_column(String, nullable=True)
    tiles_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    valid_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    variants_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_mtime: Mapped[str | None] = mapped_column(Text, nullable=True)
    no_valid_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manual_labeled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    label_source: Mapped[str | None] = mapped_column(String, nullable=True)
    solver_valid_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    classification: Mapped[str | None] = mapped_column(String, nullable=True)
    usage_log_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_coordinates: Mapped[bool] = mapped_column(default=False)
    has_boxes: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_seen_at: Mapped[str | None] = mapped_column(Text, nullable=True)
