"""Build frontend captcha display messages at the core boundary."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Literal, NotRequired, TypedDict


class CaptchaDisplayPayload(TypedDict):
    images: dict[str, str]
    tiles: list[dict[str, Any]]
    variants: list[list[str]]
    count: int


class NewCaptchaPayload(CaptchaDisplayPayload):
    type: Literal["new_captcha"]
    captcha_id: str
    top3: list[str]
    confident: bool
    created_at: float
    timeout: int | float
    owner_label: str
    owner_api_key_id: int | None
    captcha_type: NotRequired[int]
    icons_image: NotRequired[str]
    distribution: NotRequired[dict[str, Any]]
    all_icons: NotRequired[Any]


def _entry_get(entry: Any, key: str, default: Any = None) -> Any:
    if hasattr(entry, "get"):
        return entry.get(key, default)
    return getattr(entry, key, default)


@dataclass(frozen=True, slots=True)
class CaptchaDisplayFields:
    """Display-only captcha media fields shared by SSE and HTTP responses."""

    images: dict[str, str] = field(default_factory=dict)
    tiles: list[dict[str, Any]] = field(default_factory=list)
    variants: list[list[str]] = field(default_factory=list)
    count: int = 0

    def to_dict(self) -> CaptchaDisplayPayload:
        """Serialize display fields for FastAPI/JSON/SSE boundaries."""

        return {
            "images": self.images,
            "tiles": self.tiles,
            "variants": self.variants,
            "count": self.count,
        }


@dataclass(frozen=True, slots=True)
class NewCaptchaMessage:
    """Typed ``new_captcha`` event before serialization to SSE JSON."""

    captcha_id: str
    display: CaptchaDisplayFields
    top3: list[str] = field(default_factory=list)
    confident: bool = False
    created_at: float = 0.0
    timeout: int | float = 0
    owner_label: str = ""
    owner_api_key_id: int | None = None
    captcha_type: int | None = None
    icons_image: str = ""
    distribution: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> NewCaptchaPayload:
        """Serialize the event for the existing SSE push interface."""

        message: NewCaptchaPayload = {
            "type": "new_captcha",
            "captcha_id": self.captcha_id,
            **self.display.to_dict(),
            "top3": self.top3,
            "confident": self.confident,
            "created_at": self.created_at,
            "timeout": self.timeout,
            "owner_label": self.owner_label,
            "owner_api_key_id": self.owner_api_key_id,
        }
        if self.captcha_type is not None:
            message["captcha_type"] = self.captcha_type
        if self.icons_image:
            message["icons_image"] = self.icons_image
        if self.distribution is not None:
            message["distribution"] = self.distribution
        message.update(self.extra)
        return message


def build_captcha_display_fields(entry: Any) -> CaptchaDisplayFields:
    """Return display fields shared by SSE and HTTP captcha presentation APIs."""

    images = _entry_get(entry, "images", {}) or {}
    tiles = _entry_get(entry, "tiles", []) or []
    variants = _entry_get(entry, "variants", []) or []
    return CaptchaDisplayFields(
        images=dict(images),
        tiles=list(tiles),
        variants=[list(variant) for variant in variants],
        count=len(variants) if variants else len(images),
    )


def build_new_captcha_message(
    entry: Any,
    *,
    top3: list[str] | None = None,
    confident: bool = False,
    created_at: float | None = None,
    timeout: int | float,
    owner_label: str,
    owner_api_key_id: int | None,
    extra: dict[str, Any] | None = None,
) -> NewCaptchaMessage:
    """Return the single frontend/SSE ``new_captcha`` payload shape.

    Puzzle captchas are represented by raw ``tiles`` plus ``variants`` so the
    backend hot path does not assemble preview PNGs. Icon-click captchas keep
    their image fields because their operator UI still uses a single image and
    icon strip.
    """

    display_fields = build_captcha_display_fields(entry)
    return NewCaptchaMessage(
        captcha_id=_entry_get(entry, "captcha_id"),
        display=display_fields,
        top3=top3 or [],
        confident=confident,
        created_at=time.time() if created_at is None else created_at,
        timeout=_entry_get(entry, "timeout", timeout),
        owner_label=owner_label,
        owner_api_key_id=owner_api_key_id,
        captcha_type=_entry_get(entry, "captcha_type"),
        icons_image=_entry_get(entry, "icons_image", ""),
        distribution=_entry_get(entry, "distribution"),
        extra=extra or {},
    )
