from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.entities.base import Base


class DistributionAnswer(Base):
    __tablename__ = "distribution_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    distribution_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_log_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    captcha_id: Mapped[str] = mapped_column(Text, nullable=False)
    operator_id: Mapped[int] = mapped_column(Integer, nullable=False)
    icon_position: Mapped[int] = mapped_column(Integer, nullable=False)
    x: Mapped[int] = mapped_column(Integer, nullable=False)
    y: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
