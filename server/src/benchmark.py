"""Captcha solver benchmark runner."""

import glob
import json
import os
import time
from datetime import UTC, datetime

import numpy as np

from captcha_solver import (
    calculate_content_coherence,
    calculate_seam_discontinuity,
    calculate_seam_ssim,
    calculate_sobel_continuity,
    prepare_clean_tiles,
)
from src.captcha_assembly import get_valid_variant_index
from src.services import captcha_file_service

_benchmark_cache: dict | None = None


def _run_benchmark_sync():
    test_files = []
    for filepath in sorted(glob.glob(os.path.join(captcha_file_service.all_dir(), "*.json"))):
        data = captcha_file_service.read_json(filepath) or {}
        if get_valid_variant_index(data) is not None:
            test_files.append(filepath)
    total = len(test_files)
    if total == 0:
        return {
            "total": 0,
            "passed": 0,
            "coverage_percent": 0,
            "best_config": None,
        }

    all_data = []
    skipped = []
    for filepath in test_files:
        with open(filepath) as f:
            data = json.load(f)
        expected = get_valid_variant_index(data)
        if expected is None:
            skipped.append(os.path.basename(filepath))
            continue
        puzzle = data.get("puzzle", {})
        variants = puzzle.get("variantsCapture", [])
        tiles = puzzle.get("tiles", [])
        if not variants or not tiles:
            skipped.append(os.path.basename(filepath))
            continue
        images_dict = prepare_clean_tiles(tiles)
        if not images_dict:
            skipped.append(os.path.basename(filepath))
            continue
        nv = len(variants)
        metrics = np.zeros((5, nv, 4))
        for et in range(5):
            et_val = et + 1
            for i, variant in enumerate(variants):
                disc = calculate_seam_discontinuity(variant, images_dict, et_val)
                coh = calculate_content_coherence(variant, images_dict, et_val)
                ssim_v = calculate_seam_ssim(variant, images_dict, et_val)
                sobel = calculate_sobel_continuity(variant, images_dict, et_val)
                metrics[et, i] = [
                    disc if not np.isnan(disc) else float("inf"),
                    coh if not np.isnan(coh) else 0.0,
                    ssim_v if not np.isnan(ssim_v) else 0.0,
                    sobel if not np.isnan(sobel) else float("inf"),
                ]
        all_data.append((os.path.basename(filepath), expected, nv, metrics))

    total = len(all_data)
    if total == 0:
        return {
            "total": 0,
            "passed": 0,
            "coverage_percent": 0,
            "best_config": None,
            "skipped": skipped,
        }

    best_correct = 0
    best_config = None
    for wd in [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10]:
        for ws in [100, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000]:
            for wc in [5, 10, 15, 20, 30, 40, 50, 80, 100, 150, 200]:
                for wb in [0.1, 0.3, 0.5, 0.8, 1, 2, 5]:
                    for et in range(5):
                        correct = 0
                        for fname, expected, nv, metrics in all_data:
                            disc = metrics[et, :, 0]
                            coh = metrics[et, :, 1]
                            ssim_v = metrics[et, :, 2]
                            sobel = metrics[et, :, 3]
                            scores = disc * wd + (1 - ssim_v) * ws - coh * wc + sobel * wb
                            scores = np.nan_to_num(scores, nan=np.inf)
                            best_v = int(np.argmin(scores))
                            if best_v == expected:
                                correct += 1
                        if correct > best_correct:
                            best_correct = correct
                            best_config = (et + 1, wd, ws, wc, wb)

    if best_config is None:
        return {
            "total": total,
            "passed": 0,
            "coverage_percent": 0,
            "best_config": None,
            "skipped": skipped,
        }

    et, wd, ws, wc, wb = best_config
    pct = best_correct / total * 100
    return {
        "total": total,
        "passed": best_correct,
        "coverage_percent": round(pct, 1),
        "best_config": {
            "edge_trim": et,
            "W_DISC": wd,
            "W_SSIM": ws,
            "W_COH": wc,
            "W_SOBEL": wb,
        },
        "skipped": skipped,
    }


def run_benchmark_cached() -> dict:
    global _benchmark_cache
    now = time.time()

    if _benchmark_cache and (now - _benchmark_cache["_cached_at"]) < 300:
        return {k: v for k, v in _benchmark_cache.items() if not k.startswith("_")}

    try:
        bench_data = _run_benchmark_sync()
        _benchmark_cache = {
            **bench_data,
            "_cached_at": now,
            "last_run_timestamp": datetime.fromtimestamp(now, tz=UTC).isoformat(),
        }
        return {k: v for k, v in _benchmark_cache.items() if not k.startswith("_")}
    except Exception as e:
        return {
            "error": str(e),
            "last_run_timestamp": datetime.fromtimestamp(now, tz=UTC).isoformat(),
        }
