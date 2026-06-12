"""Core event contracts emitted by captcha runtime."""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CaptchaReceived:
    """Emitted after an incoming captcha is validated and tied to usage state."""

    captcha_id: str
    usage_log_id: int
    api_key_id: int


@dataclass(frozen=True)
class CaptchaDisplayed:
    """Emitted when a captcha presentation is ready for humans/operators."""

    captcha_id: str
    usage_log_id: int
    api_key_id: int
    images_count: int
    top3: list[str] = field(default_factory=list)
    is_duplicate: bool = False


@dataclass(frozen=True)
class CaptchaSolved:
    """Emitted when a submitted solution is accepted into a pending session."""

    captcha_id: str
    usage_log_id: int | None
    api_key_id: int | None
    variant_index: int
    solved_by_super: bool = False
    solver_label: str | None = None


@dataclass(frozen=True)
class CaptchaTimedOut:
    """Emitted when a manual captcha session reaches its configured timeout."""

    captcha_id: str
    usage_log_id: int | None
    api_key_id: int | None
    metadata: dict[str, Any] = field(default_factory=dict)
