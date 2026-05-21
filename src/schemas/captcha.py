"""Captcha API schemas."""

from src.models import GenerateCaptchaBody, SolveCaptchaBody, SolveRequest

__all__ = [
    "GenerateCaptchaBody",
    "SolveCaptchaBody",
    "SolveRequest",
]
