#!/usr/bin/env python3
"""Compatibility facade for the modular captcha solver pipeline."""

from __future__ import annotations

import json
import sys

from src.captcha_solver_engine.classifier import classify_captcha
from src.captcha_solver_engine.common import (
    build_captcha_context,
    decode_base64_image,
    load_captcha_data,
    prepare_clean_tiles,
    strip_black_borders,
)
from src.captcha_solver_engine.metrics import (
    calculate_content_coherence,
    calculate_seam_discontinuity,
    calculate_seam_ssim,
    calculate_sobel_continuity,
)
from src.captcha_solver_engine.ranking import assign_ranks, sort_results, top_variants
from src.captcha_solver_engine.solvers import (
    W_COH,
    W_DISC,
    W_SSIM,
    W_SOBEL,
    solve_prepared_captcha,
)

EDGE_TRIM = 1

__all__ = [
    "EDGE_TRIM",
    "W_COH",
    "W_DISC",
    "W_SSIM",
    "W_SOBEL",
    "assign_ranks",
    "build_captcha_context",
    "calculate_content_coherence",
    "calculate_seam_discontinuity",
    "calculate_seam_ssim",
    "calculate_sobel_continuity",
    "classify_captcha",
    "decode_base64_image",
    "load_captcha_data",
    "prepare_clean_tiles",
    "solve_captcha",
    "sort_results",
    "strip_black_borders",
    "top_variants",
]


def _print_context_summary(context, edge_trim: int, classification) -> None:
    print(f"Loaded {len(context.tiles)} tiles")
    print(f"Checking {len(context.variants)} variants")
    print(f"Edge trim: {edge_trim} pixels")
    print(f"Classification: {classification.kind} ({classification.confidence:.2f})")
    if context.images_dict:
        sample = next(iter(context.images_dict.values()))
        print(f"Cleaned tile size: {sample.shape[:2]}\n")


def solve_captcha(data, edge_trim=EDGE_TRIM):
    """
    Solve the captcha puzzle.

    Returns a tuple of (best_variant_index, tile_order, sorted_results).
    This public contract is intentionally kept compatible with the old solver.
    """
    context = build_captcha_context(data)
    classification = classify_captcha(context)
    _print_context_summary(context, edge_trim, classification)

    output = solve_prepared_captcha(
        context,
        classification,
        edge_trim=edge_trim,
        verbose=True,
    )

    print("\nTop 3 variants:")
    for rank, result in enumerate(output.results[:3], 1):
        print(f"  {rank}. Variant {result['variant']:2d}: score = {result['score']:8.2f}")

    print(f"\nBest variant: {output.best_variant}")
    print(f"Tile order: {output.tile_order}")

    return output.best_variant, output.tile_order, output.results


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python captcha_solver.py <captcha.json> [edge_trim]")
        print("Example: python captcha_solver.py captcha.json 1")
        return 1

    filepath = argv[1]
    edge_trim = int(argv[2]) if len(argv) > 2 else EDGE_TRIM

    try:
        data = load_captcha_data(filepath)
        best_variant, _, _ = solve_captcha(data, edge_trim=edge_trim)
        print(f"\n{'=' * 60}")
        print(f"Answer: variant {best_variant}")
        print(f"{'=' * 60}")
        return 0
    except FileNotFoundError:
        print(f"Error: file '{filepath}' was not found")
    except json.JSONDecodeError:
        print(f"Error: file '{filepath}' contains invalid JSON")
    except Exception as exc:
        print(f"Error: {exc}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
