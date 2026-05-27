"""Common preparation layer: loading, decoding, cutting, and context creation."""

from __future__ import annotations

import base64
import io
import json
from typing import Any

import numpy as np
from PIL import Image

from .models import CaptchaContext


def load_captcha_data(filepath: str) -> dict[str, Any]:
    """Load captcha data from a JSON file."""
    with open(filepath, encoding="utf-8") as f:
        return json.load(f)


def decode_base64_image(base64_data: str) -> Image.Image:
    """Decode base64 image data to a PIL image."""
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]
    image_data = base64.b64decode(base64_data)
    return Image.open(io.BytesIO(image_data)).convert("RGB")


def strip_black_borders(
    arr: np.ndarray,
    brightness_threshold: int = 40,
    max_trim: int = 10,
) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Detect and strip corrupted dark borders from a tile."""
    h, w = arr.shape[:2]
    brightness = arr.mean(axis=2, dtype=np.float64)

    top = 0
    for r in range(min(max_trim, h)):
        if brightness[r, :].mean() < brightness_threshold:
            top += 1
        else:
            break

    bottom = 0
    for r in range(min(max_trim, h)):
        if brightness[h - 1 - r, :].mean() < brightness_threshold:
            bottom += 1
        else:
            break

    left = 0
    for c in range(min(max_trim, w)):
        if brightness[:, c].mean() < brightness_threshold:
            left += 1
        else:
            break

    right = 0
    for c in range(min(max_trim, w)):
        if brightness[:, w - 1 - c].mean() < brightness_threshold:
            right += 1
        else:
            break

    cropped = arr[top : h - bottom, left : w - right]
    return cropped, (top, bottom, left, right)


def prepare_clean_tiles(tiles: list[dict[str, Any]]) -> dict[str, np.ndarray]:
    """
    Strip black borders from all tiles and resize them to a common size.

    Returns a mapping of tile_id -> cleaned numpy array.
    """
    cleaned = {}

    for tile in tiles:
        tile_id = tile["tileId"]
        img = decode_base64_image(tile["imageData"])
        arr = np.array(img)
        cropped, _ = strip_black_borders(arr)
        cleaned[tile_id] = cropped

    heights = [v.shape[0] for v in cleaned.values()]
    widths = [v.shape[1] for v in cleaned.values()]
    if not heights or not widths:
        return cleaned

    target_h = int(np.median(heights))
    target_w = int(np.median(widths))

    resized = {}
    for tile_id, arr in cleaned.items():
        if arr.shape[:2] != (target_h, target_w):
            pil_img = Image.fromarray(arr)
            pil_img = pil_img.resize((target_w, target_h), Image.LANCZOS)
            resized[tile_id] = np.array(pil_img)
        else:
            resized[tile_id] = arr

    return resized


def build_captcha_context(data: dict[str, Any]) -> CaptchaContext:
    """Build a prepared context shared by classifiers and solvers."""
    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    variants = puzzle.get("variantsCapture", [])
    images_dict = prepare_clean_tiles(tiles)
    return CaptchaContext(
        data=data,
        puzzle=puzzle,
        tiles=tiles,
        variants=variants,
        images_dict=images_dict,
    )
