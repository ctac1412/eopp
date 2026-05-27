"""Captcha image assembly and hashing utilities."""

import hashlib
import json

from captcha_solver import solve_captcha
from src.captcha_solver_engine.images import assemble_captchas
from src.captcha_solver_engine.ranking import top_variants


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
    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    variants = puzzle.get("variantsCapture", [])
    hash_input = json.dumps({"tiles": tiles, "variants": variants}, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def get_valid_variant_index(data: dict) -> int | None:
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


def get_solver_answer_from_metadata(data: dict) -> tuple[int, list[str], list[dict]] | None:
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
