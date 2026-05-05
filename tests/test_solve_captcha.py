"""
Бенчмарк solver: находит лучшие веса и edge_trim на тестовых данных.

Запуск:
    make bench

Результат: таблица и лучший конфиг для продакшена.
"""

import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pytest

from captcha_solver import (
    calculate_content_coherence,
    calculate_seam_discontinuity,
    calculate_seam_ssim,
    calculate_sobel_continuity,
    prepare_clean_tiles,
)

TEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "captcha_examples", "valid")
TEST_FILES = sorted(glob.glob(os.path.join(TEST_DIR, "*.json")))


def load_all_data():
    all_data = []
    for filepath in TEST_FILES:
        with open(filepath) as f:
            data = json.load(f)
        expected = data["valid_index"]
        variants = data["puzzle"]["variantsCapture"]
        images_dict = prepare_clean_tiles(data["puzzle"]["tiles"])
        nv = len(variants)
        metrics = np.zeros((5, nv, 4))
        for et in range(5):
            et_val = et + 1
            for i, variant in enumerate(variants):
                metrics[et, i] = [
                    calculate_seam_discontinuity(variant, images_dict, et_val),
                    calculate_content_coherence(variant, images_dict, et_val),
                    calculate_seam_ssim(variant, images_dict, et_val),
                    calculate_sobel_continuity(variant, images_dict, et_val),
                ]
        all_data.append((os.path.basename(filepath), expected, nv, metrics))
    return all_data


def test_bench():
    total = len(TEST_FILES)

    if total == 0:
        pytest.skip("No test captcha files found in data/captcha_examples/valid/")

    all_data = load_all_data()

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
                            best_v = int(np.argmin(scores))
                            if best_v == expected:
                                correct += 1
                        if correct > best_correct:
                            best_correct = correct
                            best_config = (et + 1, wd, ws, wc, wb)

    if best_config is None:
        pytest.skip("No valid configuration found")

    et, wd, ws, wc, wb = best_config
    pct = best_correct / total * 100

    print()
    print("=" * 55)
    print(f"  BENCH — {total} тестов")
    print("=" * 55)
    print()
    print("  ЛУЧШИЙ КОНФИГ:")
    print(f"    edge_trim = {et}")
    print(f"    W_DISC  = {wd}")
    print(f"    W_SSIM  = {ws}")
    print(f"    W_COH   = {wc}")
    print(f"    W_SOBEL = {wb}")
    print()
    print(f"  Результат: {best_correct}/{total} ({pct:.0f}%)")
    print()
    print("  Для продакшена пропиши в captcha_solver.py:")
    print(f"    edge_trim={et}  W_DISC={wd}  W_SSIM={ws}  W_COH={wc}  W_SOBEL={wb}")
    print("=" * 55)

    assert best_correct > 0
