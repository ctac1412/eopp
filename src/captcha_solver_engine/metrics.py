"""Metric calculations used by seam-based captcha solvers."""

from __future__ import annotations

import numpy as np
from skimage.metrics import structural_similarity as ssim


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
                value = ssim(r_ch, l_ch, data_range=255)
                if not np.isnan(value):
                    total += value
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
