"""Lightweight digit recognizer helpers for digit captcha ranking.

The recognizer is intentionally additive: confident tile->digit predictions
constrain variant ranking, while existing solver scores remain a tie-breaker.
"""

from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image
from skimage.feature import hog

from .models import CaptchaContext
from .models import CaptchaClassification


DIGIT_RECOGNIZER_MARGIN = 1.0
_MODEL_CACHE: Any | None = None
SAVED_CLASSIFICATIONS = {"digit", "puzzle", "figures", "icon_click"}


@dataclass(frozen=True)
class DigitPrediction:
    tile_id: str
    digit: int
    margin: float


def classification_from_saved_metadata(
    data: dict[str, Any],
    computed: CaptchaClassification,
) -> CaptchaClassification:
    saved = data.get("classification")
    if saved == "puzzle":
        saved = "default"
    if saved not in SAVED_CLASSIFICATIONS and saved != "default":
        return computed
    if saved == computed.kind:
        return computed
    return CaptchaClassification(
        kind=saved,
        confidence=1.0,
        details={
            **computed.details,
            "source": "saved_metadata",
            "computed_kind": computed.kind,
        },
    )


def _model_candidates() -> list[Path]:
    explicit = os.environ.get("EOPP_DIGIT_RECOGNIZER_MODEL")
    candidates = [Path(explicit)] if explicit else []
    root = Path(__file__).resolve().parents[3]
    experiments = root / "server" / "data" / "digit_recognizer_experiments"
    if experiments.exists():
        candidates.extend(
            sorted(
                experiments.glob("run_*/final_full_tile_model.pkl"),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
        )
    candidates.append(root / "server" / "models" / "digit_recognizer_full_tile.pkl")
    return candidates


def load_digit_recognizer_model():
    global _MODEL_CACHE
    if _MODEL_CACHE is not None:
        return _MODEL_CACHE
    for path in _model_candidates():
        try:
            if path.exists():
                with open(path, "rb") as f:
                    _MODEL_CACHE = pickle.load(f)
                    return _MODEL_CACHE
        except Exception:
            continue
    return None


def _extract_hog(arr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    resized = np.array(Image.fromarray(gray).resize((64, 64), Image.LANCZOS))
    return hog(
        resized,
        orientations=9,
        pixels_per_cell=(8, 8),
        cells_per_block=(2, 2),
        feature_vector=True,
    )


def predict_confident_digits(
    context: CaptchaContext,
    *,
    margin_threshold: float = DIGIT_RECOGNIZER_MARGIN,
) -> list[DigitPrediction]:
    model = load_digit_recognizer_model()
    if model is None:
        return []

    tile_ids = []
    features = []
    for tile in context.tiles:
        tile_id = tile.get("tileId")
        arr = context.images_dict.get(tile_id)
        if not tile_id or arr is None:
            continue
        tile_ids.append(tile_id)
        features.append(_extract_hog(arr))
    if not features:
        return []

    x = np.array(features)
    labels = model.predict(x)
    scores = model.decision_function(x)
    sorted_scores = np.sort(scores, axis=1)
    margins = sorted_scores[:, -1] - sorted_scores[:, -2]

    predictions = []
    for tile_id, digit, margin in zip(tile_ids, labels, margins, strict=True):
        digit = int(digit)
        margin = float(margin)
        if 1 <= digit <= 9 and margin >= margin_threshold:
            predictions.append(DigitPrediction(tile_id=tile_id, digit=digit, margin=margin))
    return predictions


def rank_variants_by_digit_predictions(
    variants: list[list[str]],
    predictions: list[DigitPrediction],
    fallback_results: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    fallback_score_by_variant = {
        int(result["variant"]): float(result.get("score", 0.0))
        for result in (fallback_results or [])
        if isinstance(result.get("variant"), int)
    }

    results = []
    for index, variant in enumerate(variants):
        matches = 0
        conflicts = 0
        matched_margin = 0.0
        conflict_margin = 0.0
        for prediction in predictions:
            expected_pos = prediction.digit - 1
            ok = expected_pos < len(variant) and variant[expected_pos] == prediction.tile_id
            if ok:
                matches += 1
                matched_margin += prediction.margin
            else:
                conflicts += 1
                conflict_margin += prediction.margin

        fallback_score = fallback_score_by_variant.get(index, 0.0)
        digit_score = matched_margin - conflict_margin
        combined_score = digit_score * 1000.0 + fallback_score
        results.append(
            {
                "variant": index,
                "score": combined_score,
                "digit_score": digit_score,
                "digit_matches": matches,
                "digit_conflicts": conflicts,
                "digit_margin": matched_margin,
                "digit_conflict_margin": conflict_margin,
                "fallback_score": fallback_score,
                "solver": "digit_recognizer",
                "classification": "digit",
                "digit_predictions": [
                    {
                        "tile_id": prediction.tile_id,
                        "digit": prediction.digit,
                        "margin": prediction.margin,
                    }
                    for prediction in predictions
                ],
            }
        )

    return sorted(
        results,
        key=lambda item: (
            item["digit_matches"],
            -item["digit_conflicts"],
            item["score"],
            item["fallback_score"],
        ),
        reverse=True,
    )
