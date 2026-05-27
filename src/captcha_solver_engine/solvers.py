"""Solver layer and solver selection by classification."""

from __future__ import annotations

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
    """Current default solver based on seam metrics."""

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


DEFAULT_SOLVER = SeamMetricsSolver()
SOLVERS_BY_CLASSIFICATION = {
    "default": DEFAULT_SOLVER,
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
