"""Captcha classification layer.

Classification pipeline (chain, first match wins):
1. FigureCaptchaClassifier — detects figure-based captchas (shapes + colors)
2. DigitCaptchaClassifier  — detects digit-based captchas (HOG+SVM)
3. DefaultCaptchaClassifier — fallback for puzzle captchas
"""

from __future__ import annotations

from .digit_classifier import DIGIT_CLASSIFIER, DigitCaptchaClassifier, is_digit_captcha
from .figures_classifier import FIGURES_CLASSIFIER, FigureCaptchaClassifier, is_figure_captcha
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


class ChainClassifier(CaptchaClassifier):
    """Runs classifiers in chain: first match wins."""

    def __init__(self, classifiers: list[CaptchaClassifier] | None = None) -> None:
        self._classifiers = classifiers or [
            FIGURES_CLASSIFIER,
            DIGIT_CLASSIFIER,
            DefaultCaptchaClassifier(),
        ]

    def classify(self, context: CaptchaContext) -> CaptchaClassification:
        for clf in self._classifiers:
            result = clf.classify(context)
            if result.kind != "default":
                return result
        fallback = DefaultCaptchaClassifier().classify(context)
        return CaptchaClassification(
            kind="default",
            confidence=fallback.confidence,
            details={**fallback.details, "classifier": "default"},
        )


DEFAULT_CLASSIFIER = ChainClassifier()


def classify_captcha(context: CaptchaContext) -> CaptchaClassification:
    """Classify a prepared captcha context using the chain classifier."""
    return DEFAULT_CLASSIFIER.classify(context)
