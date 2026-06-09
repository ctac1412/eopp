from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.entities.base import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(Text, nullable=False)


class CourseCaptcha(Base):
    __tablename__ = "course_captchas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), nullable=False)
    captcha_file_id: Mapped[int] = mapped_column(Integer, ForeignKey("captcha_files.id"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class TestRun(Base):
    __tablename__ = "test_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), nullable=False)
    participant_type: Mapped[str] = mapped_column(Text, nullable=False)
    participant_id: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="running")
    interval_min: Mapped[float] = mapped_column(default=2.0)
    interval_max: Mapped[float] = mapped_column(default=7.0)
    started_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)


class TestRunResult(Base):
    __tablename__ = "test_run_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test_run_id: Mapped[int] = mapped_column(Integer, ForeignKey("test_runs.id"), nullable=False)
    captcha_file_id: Mapped[int] = mapped_column(Integer, ForeignKey("captcha_files.id"), nullable=False)
    captcha_id: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, default="pending")
    variant_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    icon_times: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
