"""Figure captcha detection via color clustering + border contrast.

Detection:
1. K-means (k=3) on 9 tiles' dominant colors → well-separated, balanced clusters
2. Border contrast: center vs frame color difference on >=3 tiles
3. Both pass → figure captcha
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray
from sklearn.cluster import KMeans

from .models import CaptchaClassification, CaptchaContext


def _dominant_colors(images_dict: dict[str, NDArray], tiles: list[dict]) -> list[NDArray]:
    """Extract median color from center 60% of each tile."""
    result = []
    for tile in tiles:
        tid = tile["tileId"]
        arr = images_dict.get(tid)
        if arr is None:
            continue
        h, w = arr.shape[:2]
        ch, cw = h // 5, w // 5
        center = arr[ch:4 * ch, cw:4 * cw].reshape(-1, 3).astype(np.float64)
        result.append(np.median(center, axis=0))
    return result


def _border_contrasts(images_dict: dict[str, NDArray], tiles: list[dict]) -> list[float]:
    """Compute color distance between center and border for each tile."""
    result = []
    for tile in tiles:
        tid = tile["tileId"]
        arr = images_dict.get(tid)
        if arr is None:
            continue
        h, w = arr.shape[:2]
        ch, cw = h // 5, w // 5
        center = arr[ch:4 * ch, cw:4 * cw].reshape(-1, 3).astype(np.float64)
        border = np.concatenate([
            arr[:ch, :, :].reshape(-1, 3).astype(np.float64),
            arr[4 * ch:, :, :].reshape(-1, 3).astype(np.float64),
            arr[ch:4 * ch, :cw, :].reshape(-1, 3).astype(np.float64),
            arr[ch:4 * ch, 4 * cw:, :].reshape(-1, 3).astype(np.float64),
        ])
        c = np.linalg.norm(np.median(center, axis=0) - np.median(border, axis=0))
        result.append(float(c))
    return result


def _cluster_check(colors: list[NDArray]) -> bool:
    """Check if dominant colors form 3 well-separated, balanced clusters."""
    if len(colors) < 6:
        return False
    X = np.array(colors)
    km = KMeans(n_clusters=3, n_init=10, random_state=42)
    labels = km.fit_predict(X)
    centers = km.cluster_centers_

    all_dists = [np.linalg.norm(centers[i] - centers[j]) for i in range(3) for j in range(i + 1, 3)]
    min_dist = min(all_dists)
    avg_dist = sum(all_dists) / len(all_dists)
    ratio = min_dist / max(avg_dist, 1)

    sizes = [int((labels == i).sum()) for i in range(3)]
    sizes_ok = all(2 <= s <= 4 for s in sizes)

    return min_dist > 140 and sizes_ok and ratio > 0.55


@dataclass
class FigureCaptchaReport:
    is_figure_captcha: bool
    confidence: float
    tiles_with_contrast: int
    total_tiles: int


def is_figure_captcha(context: CaptchaContext) -> FigureCaptchaReport:
    tiles = context.tiles
    images_dict = context.images_dict

    colors = _dominant_colors(images_dict, tiles)
    contrasts = _border_contrasts(images_dict, tiles)
    n_contrast = sum(1 for c in contrasts if c > 80)

    cluster_ok = _cluster_check(colors)
    contrast_ok = n_contrast >= 3
    is_figure = cluster_ok and contrast_ok

    return FigureCaptchaReport(
        is_figure_captcha=is_figure,
        confidence=float(cluster_ok and contrast_ok),
        tiles_with_contrast=n_contrast,
        total_tiles=len(tiles),
    )


class FigureCaptchaClassifier:
    """Color clustering + border contrast classifier."""

    name = "figures"

    def classify(self, context: CaptchaContext) -> CaptchaClassification:
        report = is_figure_captcha(context)

        if report.is_figure_captcha:
            kind = "figures"
            confidence = report.confidence
        else:
            kind = "default"
            confidence = 1.0

        details: dict = {
            "tiles_with_contrast": report.tiles_with_contrast,
            "total_tiles": report.total_tiles,
            "method": "color_cluster",
            "classifier": self.name,
        }
        return CaptchaClassification(kind=kind, confidence=confidence, details=details)


FIGURES_CLASSIFIER = FigureCaptchaClassifier()
