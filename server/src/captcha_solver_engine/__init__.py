"""Modular captcha solver pipeline."""

from .classifier import CaptchaClassification, classify_captcha
from .common import (
    build_captcha_context,
    decode_base64_image,
    load_captcha_data,
    prepare_clean_tiles,
    strip_black_borders,
)
from .digit_classifier import is_digit_captcha
from .figures_classifier import is_figure_captcha
from .icon_click_solver import solve_icon_click
from .images import assemble_captchas
from .ranking import assign_ranks, sort_results, top_variants
from .solvers import solve_prepared_captcha

__all__ = [
    "CaptchaClassification",
    "assign_ranks",
    "assemble_captchas",
    "build_captcha_context",
    "classify_captcha",
    "decode_base64_image",
    "is_digit_captcha",
    "is_figure_captcha",
    "load_captcha_data",
    "prepare_clean_tiles",
    "solve_prepared_captcha",
    "sort_results",
    "strip_black_borders",
    "top_variants",
]
