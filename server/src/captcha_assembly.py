"""Captcha image assembly and hashing utilities."""

import hashlib
import json

from captcha_solver import solve_captcha
from src.captcha_solver_engine.icon_click_solver import solve_icon_click
from src.captcha_solver_engine.images import assemble_captchas, assemble_icon_click_preview
from src.captcha_solver_engine.ranking import top_variants


def is_icon_click_type(data: dict) -> bool:
    """Detect icon-click captcha by data structure, NOT by EOPP type field.

    Icon-click: puzzle has imageBase64 + iconsBase64, no tiles
    Puzzle:     puzzle has tiles + variantsCapture
    """
    puzzle = data.get("puzzle", {})
    if not isinstance(puzzle, dict):
        return False

    has_image = bool(puzzle.get("imageBase64"))
    has_tiles = bool(puzzle.get("tiles"))

    # Image data present + no tiles = icon-click
    return has_image and not has_tiles


def get_by_path(obj: dict | None, *keys, default=None):
    current = obj
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key, default)
        if current is default:
            return default
    return current


def captcha_hash(data):
    """Stable hash of captcha content — depends ONLY on image data, not on metadata.

    Adding fields (coordinates, solver_results, etc.) to the JSON does NOT change the hash.
    """
    if is_icon_click_type(data):
        puzzle = data.get("puzzle", data)
        image_b64 = puzzle.get("imageBase64", "") if isinstance(puzzle, dict) else ""
        icons_b64 = puzzle.get("iconsBase64", "") if isinstance(puzzle, dict) else ""
        hash_input = json.dumps({
            "imageBase64": image_b64[:1000] if image_b64 else "",
            "iconsBase64": icons_b64[:1000] if icons_b64 else "",
        }, sort_keys=True)
        return hashlib.sha256(hash_input.encode()).hexdigest()[:16]

    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    variants = puzzle.get("variantsCapture", [])
    hash_input = json.dumps({"tiles": tiles, "variants": variants}, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def get_valid_variant_index(data: dict) -> int | None:
    if is_icon_click_type(data):
        vi = data.get("valid_index")
        return vi if isinstance(vi, int) else None

    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", [])
    valid_index = data.get("valid_index")

    if not isinstance(valid_index, int):
        return None
    if valid_index < 0 or valid_index >= len(variants):
        return None
    return valid_index


def get_solver_results_from_metadata(data: dict) -> list[dict] | None:
    results = data.get("solver_results")
    if not isinstance(results, list) or not all(isinstance(item, dict) for item in results):
        return None
    if not results:
        return None
    return sorted(
        results,
        key=lambda item: (
            item.get("rank") if isinstance(item.get("rank"), int) else float("inf"),
            item.get("score") if isinstance(item.get("score"), int | float) else float("inf"),
        ),
    )


def get_solver_answer_from_metadata(data: dict) -> tuple[int, list, list[dict]] | None:
    if is_icon_click_type(data):
        puzzle = data.get("puzzle", data)
        main_b64 = puzzle.get("imageBase64", "") if isinstance(puzzle, dict) else ""
        icons_b64 = puzzle.get("iconsBase64", "") if isinstance(puzzle, dict) else ""
        if not main_b64 or not icons_b64:
            return None
        try:
            variant, coords, results = solve_icon_click(main_b64, icons_b64, verbose=False)
            return variant, coords, results
        except Exception:
            return None

    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", [])
    results = get_solver_results_from_metadata(data)
    if not results:
        return None

    variant = results[0].get("variant")
    if not isinstance(variant, int):
        return None
    if variant < 0 or variant >= len(variants):
        return None
    return variant, variants[variant], results


def get_top3_from_solver(data):
    if is_icon_click_type(data):
        return ["0"]

    top3 = data.get("solver_top3")
    if isinstance(top3, list) and all(isinstance(item, int) for item in top3):
        return [str(item) for item in top3[:3]]

    results = get_solver_results_from_metadata(data)
    if results:
        return [str(item["variant"]) for item in results[:3] if isinstance(item.get("variant"), int)]

    try:
        _, _, results = solve_captcha(data)
        return [str(variant) for variant in top_variants(results)]
    except Exception:
        return []


def hit_test(point: dict, box: dict) -> bool:
    """Check if a coordinate point falls inside a bounding box.

    Args:
        point: {"x": int, "y": int} — user click coordinate
        box:   {"x": int, "y": int, "w": int, "h": int} — top-left + size

    Returns True if point is inside (or on the border of) the box.
    """
    px, py = point.get("x"), point.get("y")
    bx, by, bw, bh = box.get("x"), box.get("y"), box.get("w"), box.get("h")
    if None in (px, py, bx, by, bw, bh):
        return False
    return (bx <= px <= bx + bw) and (by <= py <= by + bh)


def check_icon_click_answer(coords: list[dict], boxes: list[dict]) -> bool:
    """Check if all icon-click coordinates fall within their corresponding boxes.

    Returns True only if EVERY coordinate hits its box (same index).
    If lengths differ, returns False.
    """
    if len(coords) != len(boxes):
        return False
    return all(hit_test(c, boxes[i]) for i, c in enumerate(coords))
