"""Icon-click captcha solver.

Strategy:
1. Extract individual icons from the iconsBase64 strip
2. Template-match each icon on the main image (imageBase64)
3. Return center coordinates in the order they appear in the strip (left-to-right)
"""

from __future__ import annotations

import base64
import io

import cv2
import numpy as np
from PIL import Image


def _decode_b64_image(b64_data: str) -> np.ndarray:
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_data)
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(pil_img)


def _extract_icons(icons_img: np.ndarray) -> list[np.ndarray]:
    """Extract individual icons from a horizontal strip using column brightness projection."""
    if len(icons_img.shape) == 3:
        gray = cv2.cvtColor(icons_img, cv2.COLOR_RGB2GRAY)
    else:
        gray = icons_img

    h, w = gray.shape[:2]
    col_means = gray.mean(axis=0).astype(np.float64)
    global_mean = col_means.mean()

    threshold = global_mean * 0.85
    in_icon = False
    start = 0
    segments: list[tuple[int, int]] = []

    for x in range(w):
        if not in_icon and col_means[x] < threshold:
            in_icon = True
            start = x
        elif in_icon and col_means[x] >= threshold:
            in_icon = False
            segments.append((start, x))

    if in_icon:
        segments.append((start, w))

    if not segments:
        return []

    segments.sort(key=lambda s: s[1] - s[0], reverse=True)
    top_segments = segments[:5]
    top_segments.sort(key=lambda s: s[0])

    icons = []
    for x0, x1 in top_segments:
        icon = icons_img[:, x0:x1]
        if icon.shape[1] > 4:
            icons.append(icon)

    return icons


def solve_icon_click(
    main_b64: str,
    icons_b64: str,
    verbose: bool = False,
) -> tuple[int, list[dict], list[dict]]:
    """Solve an icon-click captcha.

    Returns (best_variant, coordinates, results).
    coordinates is a list of {"x": int, "y": int} dicts.
    """
    main_img = _decode_b64_image(main_b64)
    icons_img = _decode_b64_image(icons_b64)

    main_gray = cv2.cvtColor(main_img, cv2.COLOR_RGB2GRAY)
    icons_gray = cv2.cvtColor(icons_img, cv2.COLOR_RGB2GRAY)

    individual_icons = _extract_icons(icons_img)
    if len(individual_icons) < 5 and verbose:
        print(f"[icon_click] Warning: extracted {len(individual_icons)} icons, expected 5")

    coordinates: list[dict] = []
    confidences: list[float] = []

    for i, icon in enumerate(individual_icons):
        if icon.shape[0] < 4 or icon.shape[1] < 4:
            continue

        icon_gray = cv2.cvtColor(icon, cv2.COLOR_RGB2GRAY) if len(icon.shape) == 3 else icon

        scale = 1.0
        best_loc = None
        best_val = -1.0
        best_scale = 1.0

        for s in [1.0, 0.9, 1.1, 0.85, 1.15]:
            new_w = int(icon_gray.shape[1] * s)
            new_h = int(icon_gray.shape[0] * s)
            if new_w < 4 or new_h < 4:
                continue
            if new_w > main_gray.shape[1] or new_h > main_gray.shape[0]:
                continue
            tmpl = cv2.resize(icon_gray, (new_w, new_h))
            result = cv2.matchTemplate(main_gray, tmpl, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)
            if max_val > best_val:
                best_val = max_val
                best_loc = max_loc
                best_scale = s

        if best_loc is not None and best_val > 0.3:
            h_scaled = int(icon_gray.shape[0] * best_scale)
            w_scaled = int(icon_gray.shape[1] * best_scale)
            cx = int(best_loc[0] + w_scaled / 2)
            cy = int(best_loc[1] + h_scaled / 2)
            coordinates.append({"x": cx, "y": cy})
            confidences.append(float(best_val))
            if verbose:
                print(f"  Icon {i + 1}: x={cx}, y={cy}, conf={best_val:.3f}, scale={best_scale:.2f}")
        else:
            coordinates.append({"x": 0, "y": 0})
            confidences.append(0.0)
            if verbose:
                print(f"  Icon {i + 1}: NOT FOUND")

    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    results = [
        {
            "variant": 0,
            "score": avg_conf,
            "solver": "icon_click",
            "classification": "icon_click",
            "coordinates": coordinates,
            "confidences": confidences,
        }
    ]

    return 0, coordinates, results
