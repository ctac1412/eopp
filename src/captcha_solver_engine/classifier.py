"""Captcha classification layer.

New visual patterns should be added here first. The classifier chooses a stable
kind, and the solver registry maps that kind to a specialized solver.
"""

from __future__ import annotations

from .models import CaptchaClassification, CaptchaContext


class CaptchaClassifier:
    """Base classifier interface."""

    def classify(self, context: CaptchaContext) -> CaptchaClassification:
        raise NotImplementedError


class DefaultCaptchaClassifier(CaptchaClassifier):
    """Fallback classifier until concrete captcha patterns are formalized."""

    def classify(self, context: CaptchaContext) -> CaptchaClassification:
        sample_shape = None
        if context.images_dict:
            sample_shape = next(iter(context.images_dict.values())).shape[:2]
        return CaptchaClassification(
            kind="default",
            confidence=1.0,
            details={
                "tiles_count": len(context.tiles),
                "variants_count": len(context.variants),
                "tile_shape": sample_shape,
            },
        )


DEFAULT_CLASSIFIER = DefaultCaptchaClassifier()


def classify_captcha(context: CaptchaContext) -> CaptchaClassification:
    """Classify a prepared captcha context."""
    return DEFAULT_CLASSIFIER.classify(context)
