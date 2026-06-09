"""Captcha classification layer.

Classification pipeline (chain, first match wins):
1. TypeBasedClassifier      — detects icon-click captchas (type=1)
2. FigureCaptchaClassifier  — detects figure-based captchas (shapes + colors)
3. DigitCaptchaClassifier   — detects digit-based captchas (HOG+SVM)
4. DefaultCaptchaClassifier — fallback for puzzle captchas
"""

from __future__ import annotations

from .digit_classifier import DIGIT_CLASSIFIER, DigitCaptchaClassifier, is_digit_captcha
from .figures_classifier import FIGURES_CLASSIFIER, FigureCaptchaClassifier, is_figure_captcha
from .models import CaptchaClassification, CaptchaContext


class CaptchaClassifier:
    """Base classifier interface."""

    def classify(self, context: CaptchaContext) -> CaptchaClassification:
        raise NotImplementedError


class TypeBasedClassifier(CaptchaClassifier):
    """Detect icon-click captcha by data structure (imageBase64 present, no tiles)."""

    name = "type_based"

    def classify(self, context: CaptchaContext) -> CaptchaClassification:
        puzzle = context.data.get("puzzle", context.data)
        if not isinstance(puzzle, dict):
            return CaptchaClassification(kind="default", confidence=1.0)

        has_image = bool(puzzle.get("imageBase64"))
        has_tiles = bool(puzzle.get("tiles"))

        if has_image and not has_tiles:
            return CaptchaClassification(
                kind="icon_click",
                confidence=1.0,
                details={
                    "classifier": self.name,
                    "has_image": True,
                    "has_icons": bool(puzzle.get("iconsBase64")),
                },
            )

        return CaptchaClassification(kind="default", confidence=1.0)


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
            TypeBasedClassifier(),
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
