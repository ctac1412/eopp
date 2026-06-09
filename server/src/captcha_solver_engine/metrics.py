"""Metric calculations with proper 3x3 grid seam checking."""
from __future__ import annotations

import numpy as np
from skimage.metrics import structural_similarity as ssim


def _grid_neighbors(variant):
    """Return (horizontal_pairs, vertical_pairs) for a 3x3 grid.
    variant is a flat list of 9 tile IDs in row-major order:
    [r0c0, r0c1, r0c2, r1c0, r1c1, r1c2, r2c0, r2c1, r2c2]
    """
    h_pairs = []  # (i, i+1) where same row
    v_pairs = []  # (i, i+3) where same column
    for row in range(3):
        for col in range(2):
            h_pairs.append((row * 3 + col, row * 3 + col + 1))
    for row in range(2):
        for col in range(3):
            v_pairs.append((row * 3 + col, (row + 1) * 3 + col))
    return h_pairs, v_pairs


def calculate_seam_discontinuity(variant, images_dict, edge_trim=3):
    """Calculate discontinuity at ALL tile seams (horiz + vert). Lower is better."""
    arrs = [images_dict[tid] for tid in variant]
    h_pairs, v_pairs = _grid_neighbors(variant)
    total = 0.0
    count = 0
    edge_width = 8

    for i, j in h_pairs:
        if i >= len(arrs) or j >= len(arrs):
            return float("inf")
        a = arrs[i][:, edge_trim:-edge_trim, :]
        b = arrs[j][:, edge_trim:-edge_trim, :]
        if a.size == 0 or b.size == 0:
            return float("inf")
        total += np.mean(np.abs(a[:, -edge_width:, :].astype(np.float64) - b[:, :edge_width, :].astype(np.float64)))
        count += 1

    for i, j in v_pairs:
        if i >= len(arrs) or j >= len(arrs):
            return float("inf")
        a = arrs[i][edge_trim:-edge_trim, :, :]
        b = arrs[j][edge_trim:-edge_trim, :, :]
        if a.size == 0 or b.size == 0:
            return float("inf")
        total += np.mean(np.abs(a[-edge_width:, :, :].astype(np.float64) - b[:edge_width, :, :].astype(np.float64)))
        count += 1

    return total / max(count, 1)


def calculate_content_coherence(variant, images_dict, edge_trim=3):
    """Calculate gradient coherence at ALL seams. Higher is better."""
    arrs = [images_dict[tid] for tid in variant]
    h_pairs, v_pairs = _grid_neighbors(variant)
    score = 0.0
    edge_width = 12

    for i, j in h_pairs:
        if i >= len(arrs) or j >= len(arrs): return 0.0
        a = arrs[i][:, edge_trim:-edge_trim, :]
        b = arrs[j][:, edge_trim:-edge_trim, :]
        if a.size == 0 or b.size == 0: return 0.0
        r_region = a[:, -edge_width:, :]
        l_region = b[:, :edge_width, :]
        rg = np.gradient(r_region.mean(axis=2), axis=1)
        lg = np.gradient(l_region.mean(axis=2), axis=1)
        if rg.size > 0 and lg.size > 0:
            corr = np.corrcoef(rg.flatten(), lg.flatten())[0, 1]
            if not np.isnan(corr): score += corr

    for i, j in v_pairs:
        if i >= len(arrs) or j >= len(arrs): return 0.0
        a = arrs[i][edge_trim:-edge_trim, :, :]  # top
        b = arrs[j][edge_trim:-edge_trim, :, :]  # bottom
        if a.size == 0 or b.size == 0: return 0.0
        bot_region = a[-edge_width:, :, :]
        top_region = b[:edge_width, :, :]
        bg = np.gradient(bot_region.mean(axis=2), axis=0)  # vertical gradient
        tg = np.gradient(top_region.mean(axis=2), axis=0)
        if bg.size > 0 and tg.size > 0:
            corr = np.corrcoef(bg.flatten(), tg.flatten())[0, 1]
            if not np.isnan(corr): score += corr

    return score


def calculate_seam_ssim(variant, images_dict, edge_trim=3):
    """Calculate SSIM at ALL seams. Higher is better."""
    arrs = [images_dict[tid] for tid in variant]
    h_pairs, v_pairs = _grid_neighbors(variant)
    total = 0.0
    count = 0
    edge_width = 16

    for i, j in h_pairs + v_pairs:
        if i >= len(arrs) or j >= len(arrs): continue
        a = arrs[i][:, edge_trim:-edge_trim, :]
        b = arrs[j][:, edge_trim:-edge_trim, :]
        if a.size == 0 or b.size == 0: continue

        if (i, j) in h_pairs:
            edge_a = a[:, -edge_width:, :]
            edge_b = b[:, :edge_width, :]
        else:
            edge_a = a[-edge_width:, :, :]
            edge_b = b[:edge_width, :, :]

        for ch in range(3):
            try:
                value = ssim(edge_a[:,:,ch].astype(np.float64), edge_b[:,:,ch].astype(np.float64), data_range=255)
                if not np.isnan(value):
                    total += value; count += 1
            except ValueError: pass

    return total / max(count, 1)


def calculate_sobel_continuity(variant, images_dict, edge_trim=3):
    """Calculate Sobel edge continuity at ALL seams. Lower is better."""
    arrs = [images_dict[tid] for tid in variant]
    h_pairs, v_pairs = _grid_neighbors(variant)
    total = 0.0
    count = 0
    edge_width = 10

    for i, j in h_pairs + v_pairs:
        if i >= len(arrs) or j >= len(arrs):
            return float("inf")
        a = arrs[i][:, edge_trim:-edge_trim, :].mean(axis=2).astype(np.float64)
        b = arrs[j][:, edge_trim:-edge_trim, :].mean(axis=2).astype(np.float64)
        if a.size == 0 or b.size == 0:
            return float("inf")

        right_edge = a[:, -edge_width:]
        left_edge = b[:, :edge_width]

        rx = np.gradient(right_edge, axis=1)
        lx = np.gradient(left_edge, axis=1)
        ry = np.gradient(right_edge, axis=0)
        ly = np.gradient(left_edge, axis=0)

        r_mag = np.sqrt(rx**2 + ry**2)
        l_mag = np.sqrt(lx**2 + ly**2)

        seam_right = r_mag[:, -3:]
        seam_left = l_mag[:, :3]

        total += np.mean(np.abs(seam_right - seam_left))
        count += 1

    return total / max(count, 1)
