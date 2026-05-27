"""Digit captcha detection — HOG+SVM tile classifier.

Trained on 10 digit captchas (90 tiles) vs 148 puzzle captchas (1332 tiles).
Classifies each tile. Captcha is digit if >= 5 of 9 tiles are classified as digit.

Artifact: data/tile_classifier.pkl — StandardScaler + LinearSVC pickle.
"""
from __future__ import annotations

import os
import pickle
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image
from skimage.feature import hog

from .models import CaptchaClassification, CaptchaContext

_MODEL_PATH = os.environ.get(
    "EOPP_TILE_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "tile_classifier.pkl"),
)
_model_cache: dict | None = None


def _load_model() -> dict:
    global _model_cache
    if _model_cache is None:
        with open(_MODEL_PATH, 'rb') as f:
            _model_cache = pickle.load(f)
    return _model_cache


def _extract_hog(gray: NDArray) -> NDArray:
    arr_rs = np.array(Image.fromarray(gray).resize((64, 36), Image.LANCZOS))
    return hog(arr_rs, orientations=9, pixels_per_cell=(8, 8), cells_per_block=(2, 2),
               feature_vector=True)


def _classify_tiles(tile_arrays: list[NDArray]) -> list[int]:
    model = _load_model()
    scaler = model['scaler']
    clf = model['clf']

    features = np.array([_extract_hog(g) for g in tile_arrays])
    features_s = scaler.transform(features)
    preds = clf.predict(features_s)
    return preds.tolist()


@dataclass
class DigitCaptchaReport:
    is_digit_captcha: bool
    confidence: float
    method: str
    tiles_with_digits: int
    total_tiles: int
    detected_digits: list[int]


def is_digit_captcha(context: CaptchaContext) -> DigitCaptchaReport:
    tile_arrays = []
    for tile in context.tiles:
        tid = tile['tileId']
        arr = context.images_dict.get(tid)
        if arr is not None:
            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
            tile_arrays.append(gray)

    total = len(tile_arrays)
    preds = _classify_tiles(tile_arrays)
    digit_tiles = int(sum(preds))

    is_digit = digit_tiles >= 5

    return DigitCaptchaReport(
        is_digit_captcha=is_digit,
        confidence=digit_tiles / total,
        method='hog_svm',
        tiles_with_digits=digit_tiles,
        total_tiles=total,
        detected_digits=[],
    )


class DigitCaptchaClassifier:
    """HOG+SVM tile classifier — >= 5/9 tiles classified as digit."""

    name = 'digit'

    def classify(self, context: CaptchaContext) -> CaptchaClassification:
        report = is_digit_captcha(context)

        if report.is_digit_captcha:
            kind = 'digit'
            confidence = report.confidence
        else:
            kind = 'default'
            confidence = 1.0

        details: dict = {
            'tiles_with_digits': report.tiles_with_digits,
            'total_tiles': report.total_tiles,
            'method': report.method,
            'classifier': self.name,
        }
        return CaptchaClassification(kind=kind, confidence=confidence, details=details)


DIGIT_CLASSIFIER = DigitCaptchaClassifier()
