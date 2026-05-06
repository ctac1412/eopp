#!/usr/bin/env python3
"""
Captcha Solver - Puzzle Tile Matcher

Этот скрипт определяет правильный порядок тайлов в пазл-капче,
анализируя согласованность контента между соседними тайлами.

Алгоритм:
1. Динамически удаляет чёрные коррумпированные бордеры с тайлов
2. Вычисляет discontinuity - разницу пикселей на стыках
3. Вычисляет coherence - корреляцию градиентов
4. Вычисляет SSIM - структурное сходство на стыках
5. Вычисляет Sobel continuity - непрерывность краёв
6. Агрегирует метрики с весами
7. Ensemble: запускает с разными edge_trim и голосует

Использование:
    python captcha_solver.py <путь_к_файлу.json>
"""

import base64
import io
import json
import sys

import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim

EDGE_TRIM = 1
W_DISC = 0.5
W_SSIM = 800.0
W_COH = 80.0
W_SOBEL = 0.5


def load_captcha_data(filepath):
    """Load captcha data from JSON file"""
    with open(filepath) as f:
        return json.load(f)


def decode_base64_image(base64_data):
    """Decode base64 image data to PIL Image"""
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]
    image_data = base64.b64decode(base64_data)
    return Image.open(io.BytesIO(image_data)).convert("RGB")


def strip_black_borders(arr, brightness_threshold=40, max_trim=10):
    """
    Dynamically detect and strip corrupted black borders from a tile.
    Returns cropped array and the trim values (top, bottom, left, right).
    """
    h, w = arr.shape[:2]
    brightness = arr.mean(axis=2, dtype=np.float64)

    # Top: strip dark rows
    top = 0
    for r in range(min(max_trim, h)):
        if brightness[r, :].mean() < brightness_threshold:
            top += 1
        else:
            break

    # Bottom: strip dark rows
    bottom = 0
    for r in range(min(max_trim, h)):
        if brightness[h - 1 - r, :].mean() < brightness_threshold:
            bottom += 1
        else:
            break

    # Left: strip dark columns
    left = 0
    for c in range(min(max_trim, w)):
        if brightness[:, c].mean() < brightness_threshold:
            left += 1
        else:
            break

    # Right: strip dark columns
    right = 0
    for c in range(min(max_trim, w)):
        if brightness[:, w - 1 - c].mean() < brightness_threshold:
            right += 1
        else:
            break

    cropped = arr[top : h - bottom, left : w - right]
    return cropped, (top, bottom, left, right)


def prepare_clean_tiles(tiles):
    """
    Strip black borders from all tiles and resize to common size.
    Returns dict mapping tile_id -> cleaned numpy array.
    """
    cleaned = {}
    target_h, target_w = None, None

    for tile in tiles:
        tile_id = tile["tileId"]
        img = decode_base64_image(tile["imageData"])
        arr = np.array(img)
        cropped, _ = strip_black_borders(arr)
        cleaned[tile_id] = cropped

        if target_h is None:
            target_h, target_w = cropped.shape[:2]

    # Resize all tiles to the most common size (use median)
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


def calculate_seam_discontinuity(variant, images_dict, edge_trim=3):
    """Calculate discontinuity at tile seams. Lower is better."""
    arrs = [images_dict[tid] for tid in variant]
    total = 0.0

    for i in range(len(arrs) - 1):
        right = arrs[i][:, edge_trim:-edge_trim, :]
        left = arrs[i + 1][:, edge_trim:-edge_trim, :]

        if right.size == 0 or left.size == 0:
            return float("inf")

        edge_width = 8
        right_edge = right[:, -edge_width:, :]
        left_edge = left[:, :edge_width, :]

        diff = np.mean(np.abs(right_edge.astype(np.float64) - left_edge.astype(np.float64)))
        total += diff

    return total


def calculate_content_coherence(variant, images_dict, edge_trim=3):
    """Calculate gradient coherence between adjacent tiles. Higher is better."""
    arrs = [images_dict[tid] for tid in variant]
    score = 0.0

    for i in range(len(arrs) - 1):
        right = arrs[i][:, edge_trim:-edge_trim, :]
        left = arrs[i + 1][:, edge_trim:-edge_trim, :]

        if right.size == 0 or left.size == 0:
            return 0.0

        edge_width = 12
        right_region = right[:, -edge_width:, :]
        left_region = left[:, :edge_width, :]

        right_grad = np.gradient(right_region.mean(axis=2), axis=1)
        left_grad = np.gradient(left_region.mean(axis=2), axis=1)

        if right_grad.size > 0 and left_grad.size > 0:
            corr = np.corrcoef(right_grad.flatten(), left_grad.flatten())[0, 1]
            if not np.isnan(corr):
                score += corr

    return score


def calculate_seam_ssim(variant, images_dict, edge_trim=3):
    """Calculate SSIM at tile seams. Higher is better."""
    arrs = [images_dict[tid] for tid in variant]
    total = 0.0
    count = 0

    for i in range(len(arrs) - 1):
        right = arrs[i][:, edge_trim:-edge_trim, :]
        left = arrs[i + 1][:, edge_trim:-edge_trim, :]

        if right.size == 0 or left.size == 0:
            continue

        edge_width = 16
        right_edge = right[:, -edge_width:, :]
        left_edge = left[:, :edge_width, :]

        for ch in range(3):
            r_ch = right_edge[:, :, ch].astype(np.float64)
            l_ch = left_edge[:, :, ch].astype(np.float64)
            try:
                s = ssim(r_ch, l_ch, data_range=255)
                if not np.isnan(s):
                    total += s
                    count += 1
            except ValueError:
                pass

    return total / max(count, 1)


def calculate_sobel_continuity(variant, images_dict, edge_trim=3):
    """Calculate Sobel edge continuity across seams. Lower is better."""
    arrs = [images_dict[tid] for tid in variant]
    total = 0.0

    for i in range(len(arrs) - 1):
        right = arrs[i][:, edge_trim:-edge_trim, :].mean(axis=2).astype(np.float64)
        left = arrs[i + 1][:, edge_trim:-edge_trim, :].mean(axis=2).astype(np.float64)

        if right.size == 0 or left.size == 0:
            return float("inf")

        edge_width = 10
        right_edge = right[:, -edge_width:]
        left_edge = left[:, :edge_width]

        rx = np.gradient(right_edge, axis=1)
        lx = np.gradient(left_edge, axis=1)
        ry = np.gradient(right_edge, axis=0)
        ly = np.gradient(left_edge, axis=0)

        r_mag = np.sqrt(rx**2 + ry**2)
        l_mag = np.sqrt(lx**2 + ly**2)

        seam_right = r_mag[:, -3:]
        seam_left = l_mag[:, :3]

        diff = np.mean(np.abs(seam_right - seam_left))
        total += diff

    return total


def solve_captcha(data, edge_trim=EDGE_TRIM):
    """
    Solve the captcha puzzle.

    Args:
        data: Captcha data dictionary
        edge_trim: Number of pixels to trim from tile edges

    Returns:
        Tuple of (best_variant_index, tile_order, results)
    """

    tiles = data["puzzle"]["tiles"]
    variants = data["puzzle"]["variantsCapture"]

    images_dict = prepare_clean_tiles(tiles)

    print(f"Loaded {len(tiles)} tiles")
    print(f"Checking {len(variants)} variants")
    print(f"Edge trim: {edge_trim} pixels")
    if images_dict:
        sample = next(iter(images_dict.values()))
        print(f"Cleaned tile size: {sample.shape[:2]}\n")

    results = []
    best_variant = None
    best_score = float("inf")

    for i, variant in enumerate(variants):
        disc = calculate_seam_discontinuity(variant, images_dict, edge_trim)
        coh = calculate_content_coherence(variant, images_dict, edge_trim)
        seam_s = calculate_seam_ssim(variant, images_dict, edge_trim)
        sobel = calculate_sobel_continuity(variant, images_dict, edge_trim)

        score = disc * W_DISC + (1.0 - seam_s) * W_SSIM - coh * W_COH + sobel * W_SOBEL

        results.append(
            {
                "variant": i,
                "score": score,
                "discontinuity": disc,
                "coherence": coh,
                "ssim": seam_s,
                "sobel": sobel,
            }
        )

        print(
            f"Variant {i:2d}: score = {score:8.2f} "
            f"(disc={disc:6.2f}, coh={coh:5.2f}, ssim={seam_s:.3f}, sobel={sobel:.2f})"
        )

        if score < best_score:
            best_score = score
            best_variant = i

    results.sort(key=lambda x: x["score"])
    print("\nTop 3 variants:")
    for rank, res in enumerate(results[:3], 1):
        print(f"  {rank}. Variant {res['variant']:2d}: score = {res['score']:8.2f}")

    print(f"\nBest variant: {best_variant}")
    print(f"Tile order: {variants[best_variant]}")

    return best_variant, variants[best_variant], results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python captcha_solver.py <путь_к_файлу.json> [edge_trim]")
        print("Пример: python captcha_solver.py captcha.json 1")
        print("edge_trim: количество пикселей для обрезки краев (по умолчанию: 1)")
        sys.exit(1)

    filepath = sys.argv[1]
    edge_trim = int(sys.argv[2]) if len(sys.argv) > 2 else 1

    try:
        data = load_captcha_data(filepath)
        best_variant, tile_order, _ = solve_captcha(data, edge_trim=edge_trim)

        print(f"\n{'=' * 60}")
        print(f"Ответ: вариант {best_variant}")
        print(f"{'=' * 60}")
    except FileNotFoundError:
        print(f"Ошибка: Файл '{filepath}' не найден")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Ошибка: Файл '{filepath}' содержит некорректный JSON")
        sys.exit(1)
    except Exception as e:
        print(f"Ошибка: {e}")
        sys.exit(1)
