"""Shared data structures for the captcha solver pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass(frozen=True)
class CaptchaContext:
    data: dict[str, Any]
    puzzle: dict[str, Any]
    tiles: list[dict[str, Any]]
    variants: list[list[str]]
    images_dict: dict[str, np.ndarray]


@dataclass(frozen=True)
class CaptchaClassification:
    kind: str = "default"
    confidence: float = 1.0
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SolverOutput:
    best_variant: int | None
    tile_order: list[str]
    results: list[dict[str, Any]]
    classification: CaptchaClassification
    solver_name: str
