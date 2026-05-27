"""Solver layer and solver selection by classification."""

from __future__ import annotations

import cv2
import numpy as np

from .metrics import (
    calculate_content_coherence,
    calculate_seam_discontinuity,
    calculate_seam_ssim,
    calculate_sobel_continuity,
)
from .models import CaptchaClassification, CaptchaContext, SolverOutput
from .ranking import sort_results

W_DISC = 0.5
W_SSIM = 800.0
W_COH = 80.0
W_SOBEL = 0.5


class BaseCaptchaSolver:
    name = "base"

    def solve(
        self,
        context: CaptchaContext,
        classification: CaptchaClassification,
        edge_trim: int,
        verbose: bool = True,
    ) -> SolverOutput:
        raise NotImplementedError


class SeamMetricsSolver(BaseCaptchaSolver):
    """Default solver based on seam metrics (discontinuity, SSIM, coherence, Sobel)."""

    name = "seam_metrics"

    def solve(
        self,
        context: CaptchaContext,
        classification: CaptchaClassification,
        edge_trim: int,
        verbose: bool = True,
    ) -> SolverOutput:
        results = []
        best_variant = None
        best_score = float("inf")

        for i, variant in enumerate(context.variants):
            disc = calculate_seam_discontinuity(variant, context.images_dict, edge_trim)
            coh = calculate_content_coherence(variant, context.images_dict, edge_trim)
            seam_s = calculate_seam_ssim(variant, context.images_dict, edge_trim)
            sobel = calculate_sobel_continuity(variant, context.images_dict, edge_trim)

            score = disc * W_DISC + (1.0 - seam_s) * W_SSIM - coh * W_COH + sobel * W_SOBEL

            results.append(
                {
                    "variant": i,
                    "score": score,
                    "discontinuity": disc,
                    "coherence": coh,
                    "ssim": seam_s,
                    "sobel": sobel,
                    "solver": self.name,
                    "classification": classification.kind,
                }
            )

            if verbose:
                print(
                    f"Variant {i:2d}: score = {score:8.2f} "
                    f"(disc={disc:6.2f}, coh={coh:5.2f}, ssim={seam_s:.3f}, sobel={sobel:.2f})"
                )

            if score < best_score:
                best_score = score
                best_variant = i

        sorted_results = sort_results(results)
        tile_order = context.variants[best_variant] if best_variant is not None else []
        return SolverOutput(
            best_variant=best_variant,
            tile_order=tile_order,
            results=sorted_results,
            classification=classification,
            solver_name=self.name,
        )


class DigitCaptchaSolver(BaseCaptchaSolver):
    """Solver for digit-based captchas.

    Strategy: recognize digits on each tile, build the correct ordering
    from the digit sequence (1-9). Falls back to seam metrics if digit
    detection fails.
    """

    name = "digit_solver"

    def solve(
        self,
        context: CaptchaContext,
        classification: CaptchaClassification,
        edge_trim: int,
        verbose: bool = True,
    ) -> SolverOutput:
        # TODO: implement digit recognition + ordering
        # For now, fall back to seam metrics
        if verbose:
            print(f"[{self.name}] Digit captcha detected — using seam metrics fallback")

        return SeamMetricsSolver().solve(context, classification, edge_trim, verbose)


class FigureCaptchaSolver(BaseCaptchaSolver):
    """Solver for figure-based captchas.

    Strategy: score each variant by row shape similarity.
    - Crop tiles to center 60% (shape region)
    - For each variant, compute SSIM within rows (same shape = high)
      minus SSIM across rows (different shapes = low)
    - Pick variant with highest gap.
    """

    name = "figure_solver"

    def solve(
        self,
        context: CaptchaContext,
        classification: CaptchaClassification,
        edge_trim: int,
        verbose: bool = True,
    ) -> SolverOutput:
        from skimage.metrics import structural_similarity as ssim

        images_dict = context.images_dict
        tiles = context.tiles
        variants = context.variants

        # Build center-cropped grayscale images
        crops: dict[str, np.ndarray] = {}
        for tile in tiles:
            tid = tile["tileId"]
            arr = images_dict.get(tid)
            if arr is None:
                continue
            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY).astype(np.float64) / 255.0
            h, w = gray.shape
            ch, cw = h // 5, w // 5
            crops[tid] = gray[ch:4 * ch, cw:4 * cw]

        results = []
        best_variant = None
        best_score = -float("inf")

        for vi, variant in enumerate(variants):
            rows = [variant[0:3], variant[3:6], variant[6:9]]

            # Within-row SSIM (want high)
            row_sims = []
            for row in rows:
                sims = []
                for i in range(len(row)):
                    for j in range(i + 1, len(row)):
                        a = crops.get(row[i])
                        b = crops.get(row[j])
                        if a is not None and b is not None:
                            try:
                                sims.append(ssim(a, b, data_range=1.0))
                            except ValueError:
                                pass
                if sims:
                    row_sims.append(np.mean(sims))

            # Cross-row SSIM (want low)
            cross_sims = []
            for ri in range(3):
                for rj in range(ri + 1, 3):
                    for tid_i in rows[ri]:
                        for tid_j in rows[rj]:
                            a = crops.get(tid_i)
                            b = crops.get(tid_j)
                            if a is not None and b is not None:
                                try:
                                    cross_sims.append(ssim(a, b, data_range=1.0))
                                except ValueError:
                                    pass

            within = np.mean(row_sims) if row_sims else 0.0
            cross = np.mean(cross_sims) if cross_sims else 0.0
            score = within - cross

            results.append({
                "variant": vi,
                "score": float(score),
                "within": float(within),
                "cross": float(cross),
                "solver": self.name,
                "classification": classification.kind,
            })

            if verbose:
                print(
                    f"[{self.name}] Variant {vi:2d}: score={score:8.4f} "
                    f"(within={within:.4f}, cross={cross:.4f})"
                )

            if score > best_score:
                best_score = score
                best_variant = vi

        sorted_results = sort_results(results)
        tile_order = context.variants[best_variant] if best_variant is not None else []
        return SolverOutput(
            best_variant=best_variant,
            tile_order=tile_order,
            results=sorted_results,
            classification=classification,
            solver_name=self.name,
        )


DEFAULT_SOLVER = SeamMetricsSolver()
SOLVERS_BY_CLASSIFICATION = {
    "default": DEFAULT_SOLVER,
    "digit": DigitCaptchaSolver(),
    "figures": FigureCaptchaSolver(),
}


def solver_for_classification(classification: CaptchaClassification) -> BaseCaptchaSolver:
    """Choose a solver for a classification, falling back to the default solver."""
    return SOLVERS_BY_CLASSIFICATION.get(classification.kind, DEFAULT_SOLVER)


def solve_prepared_captcha(
    context: CaptchaContext,
    classification: CaptchaClassification,
    edge_trim: int,
    verbose: bool = True,
) -> SolverOutput:
    """Run the solver selected for a prepared captcha context."""
    solver = solver_for_classification(classification)
    return solver.solve(context, classification, edge_trim=edge_trim, verbose=verbose)
