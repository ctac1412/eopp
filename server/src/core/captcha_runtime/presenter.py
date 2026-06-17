"""Captcha presentation builder for human-facing solve sessions."""

from __future__ import annotations
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from src.captcha_assembly import assemble_captchas, get_valid_variant_index, is_icon_click_type

from .sessions import CaptchaSession


@dataclass
class CaptchaPresentation:
    """Human/operator display payload produced for a captcha session."""

    session: CaptchaSession
    is_icon_click: bool = False
    is_distributed: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class CaptchaPresenter:
    """Build only the display data needed before a captcha enters pending state.

    Puzzle captchas are assembled in core. Icon-click captcha preparation stays
    injected because it currently depends on operator/distribution adapters that
    are intentionally outside the protected core boundary.
    """

    def __init__(
        self,
        assemble_puzzle: Callable[[list, list, int | None], list[dict[str, Any]]] = assemble_captchas,
        prepare_icon_session: Callable[..., Any] | None = None,
    ) -> None:
        self._assemble_puzzle = assemble_puzzle
        self._prepare_icon_session = prepare_icon_session

    async def build(
        self,
        *,
        captcha_id: str,
        data: dict[str, Any],
        usage_log_id: int,
        api_key_id: int,
        event,
        auto_solve_rucaptcha: bool = False,
    ) -> CaptchaPresentation:
        """Create a pending-session presentation for puzzle or icon-click data."""

        if is_icon_click_type(data):
            if self._prepare_icon_session is None:
                session = CaptchaSession(
                    captcha_id=captcha_id,
                    captcha_type=1,
                    variants=[],
                    images={},
                    event=event,
                    usage_log_id=usage_log_id,
                    api_key_id=api_key_id,
                )
                return CaptchaPresentation(session=session, is_icon_click=True)

            prepared = await self._prepare_icon_session(
                captcha_id=captcha_id,
                data=data,
                usage_log_id=usage_log_id,
                api_key_id=api_key_id,
                event=event,
                auto_solve_rucaptcha=auto_solve_rucaptcha,
            )
            return prepared

        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])
        valid_index = get_valid_variant_index(data)
        session = CaptchaSession(
            captcha_id=captcha_id,
            variants=variants,
            images={},
            event=event,
            usage_log_id=usage_log_id,
            api_key_id=api_key_id,
            tiles=tiles,
            valid_index=valid_index,
        )
        return CaptchaPresentation(session=session, metadata={"generated": 0})
