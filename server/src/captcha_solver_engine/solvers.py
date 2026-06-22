"""Solver layer and solver selection by classification."""

from __future__ import annotations

import cv2
import numpy as np

from .icon_click_solver import solve_icon_click
from .metrics import (
    calculate_content_coherence,
    calculate_seam_discontinuity,
    calculate_seam_ssim,
    calculate_sobel_continuity,
)
from .models import CaptchaClassification, CaptchaContext, SolverOutput
from .ranking import sort_results
from .digit_recognizer import predict_confident_digits, rank_variants_by_digit_predictions

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
    """Solver using learned ML weights on seam metrics.

    Uses LogisticRegression trained on 141 labeled puzzle captchas
    to score variants by probability of being correct.
    Falls back to hardcoded weights if model is unavailable.
    """

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
        best_score = -float("inf")  # ML uses higher=better

        # Try loading ML model
        ml_scorer = None
        try:
            import os as _os
            import pickle
            model_path = _os.path.join(_os.path.dirname(__file__), '..', '..', 'models', 'puzzle_scorer.pkl')
            if _os.path.exists(model_path):
                with open(model_path, 'rb') as f:
                    ml_scorer = pickle.load(f)
        except Exception:
            pass

        for i, variant in enumerate(context.variants):
            disc = calculate_seam_discontinuity(variant, context.images_dict, edge_trim)
            coh = calculate_content_coherence(variant, context.images_dict, edge_trim)
            seam_s = calculate_seam_ssim(variant, context.images_dict, edge_trim)
            sobel = calculate_sobel_continuity(variant, context.images_dict, edge_trim)

            if ml_scorer is not None:
                import numpy as np
                feats = np.array([[disc, coh, seam_s, sobel]])
                feats_s = ml_scorer['scaler'].transform(feats)
                score = float(ml_scorer['clf'].predict_proba(feats_s)[0, 1])  # prob of correct
                # want HIGH prob = better
            else:
                score = -(disc * W_DISC + (1.0 - seam_s) * W_SSIM - coh * W_COH + sobel * W_SOBEL)

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
                    f"Variant {i:2d}: score = {score:10.6f} "
                    f"(disc={disc:6.2f}, coh={coh:5.2f}, ssim={seam_s:.3f}, sobel={sobel:.2f})"
                )

            if score > best_score:
                best_score = score
                best_variant = i

        sorted_results = sort_results(results, reverse=True)  # ML: higher=better

        # Confidence: gap between best and second-best
        confident = False
        if len(sorted_results) >= 2:
            best = sorted_results[0]["score"]
            second = sorted_results[1]["score"]
            if ml_scorer is not None:
                confident = (best - second) > 0.15
            else:
                if abs(best) > 0.001:
                    confident = abs(best - second) / abs(best) > 0.15

        tile_order = context.variants[best_variant] if best_variant is not None else []
        return SolverOutput(
            best_variant=best_variant,
            tile_order=tile_order,
            results=sorted_results,
            classification=classification,
            solver_name=self.name,
            confident=confident,
        )


class DigitCaptchaSolver(BaseCaptchaSolver):
    """Solver for digit-based captchas.

    Strategy:
    1. EasyOCR multi-preprocessing to read digits 1-9 on tiles
    2. Known digits fix their positions in the 1-9 sequence
    3. Unknown tiles permuted to fill gaps (≤5! = 120 permutations)
    4. Best variant matched against the inferred order
    5. Returns an uncertain no-signal result instead of trusting puzzle seams
    """

    name = "digit_solver"

    def solve(
        self,
        context: CaptchaContext,
        classification: CaptchaClassification,
        edge_trim: int,
        verbose: bool = True,
    ) -> SolverOutput:
        import itertools

        images_dict = context.images_dict
        tiles = context.tiles
        variants = context.variants

        digit_predictions = predict_confident_digits(context)
        if digit_predictions:
            fallback = SeamMetricsSolver().solve(context, classification, edge_trim, verbose=False)
            sorted_results = rank_variants_by_digit_predictions(
                variants,
                digit_predictions,
                fallback.results,
            )
            best_variant = sorted_results[0]["variant"] if sorted_results else None
            tile_order = variants[best_variant] if best_variant is not None else []
            confident = (
                sorted_results[0]["digit_matches"] >= 2
                and sorted_results[0]["digit_conflicts"] == 0
                if sorted_results
                else False
            )
            if verbose:
                print(
                    f"[{self.name}] recognizer: {len(digit_predictions)}/9 confident digits, "
                    f"best={best_variant}, confident={confident}"
                )
            return SolverOutput(
                best_variant=best_variant,
                tile_order=tile_order,
                results=sorted_results,
                classification=classification,
                solver_name=f"{self.name}:recognizer",
                confident=confident,
            )

        # Read digits via EasyOCR
        try:
            import easyocr
            reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        except ImportError:
            if verbose:
                print(f"[{self.name}] EasyOCR not available - no digit signal")
            return SolverOutput(
                best_variant=None,
                tile_order=[],
                results=[],
                classification=classification,
                solver_name=self.name,
                confident=False,
            )

        known: dict[str, int] = {}  # tile_id -> digit
        unknown: list[str] = []     # tile_ids without digit

        for tile in tiles:
            tid = tile["tileId"]
            arr = images_dict.get(tid)
            if arr is None:
                unknown.append(tid)
                continue

            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
            h, w = gray.shape

            best: dict[int, float] = {}
            pipelines = [
                cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB),
                cv2.cvtColor(cv2.bilateralFilter(gray, 9, 75, 75), cv2.COLOR_GRAY2RGB),
                cv2.cvtColor(255 - gray, cv2.COLOR_GRAY2RGB),
                cv2.cvtColor(cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC), cv2.COLOR_GRAY2RGB),
            ]
            for rgb in pipelines:
                results = reader.readtext(rgb, allowlist='0123456789')
                for _bbox, text, conf in results:
                    if conf > 0.3 and text.isdigit():
                        d = int(text)
                        if 1 <= d <= 9 and conf > best.get(d, 0):
                            best[d] = conf

            if best:
                best_d = max(best.items(), key=lambda x: x[1])
                known[tid] = best_d[0]
            else:
                unknown.append(tid)

        if verbose:
            print(f"[{self.name}] OCR: {len(known)}/9 digits read, {len(unknown)} unknown")

        if len(known) < 2:
            if verbose:
                print(f"[{self.name}] Too few digits - no digit signal")
            return SolverOutput(
                best_variant=None,
                tile_order=[],
                results=[],
                classification=classification,
                solver_name=self.name,
                confident=False,
            )

        # Deduce missing digits and find best arrangement
        found_set = set(known.values())
        missing = sorted(set(range(1, 10)) - found_set)

        best_variant = None
        best_count = 0

        for perm in itertools.permutations(unknown, len(missing)):
            assignment = dict(known)
            for tid, d in zip(perm, missing):
                assignment[tid] = d

            target = sorted(assignment.items(), key=lambda x: x[1])
            target_ids = [tid for tid, _ in target]

            for vi, variant in enumerate(variants):
                cnt = sum(1 for pos, tid in enumerate(target_ids) if pos < 9 and variant[pos] == tid)
                if cnt > best_count:
                    best_count = cnt
                    best_variant = vi

        results = [{
            "variant": best_variant if best_variant is not None else -1,
            "score": float(best_count),
            "solver": self.name,
            "classification": classification.kind,
        }]

        tile_order = variants[best_variant] if best_variant is not None else []
        confident = best_count >= 7  # 7+ of 9 tiles matched
        return SolverOutput(
            best_variant=best_variant,
            tile_order=tile_order,
            results=results,
            classification=classification,
            solver_name=self.name,
            confident=confident,
        )


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

        sorted_results = sort_results(results, reverse=True)
        # Relative gap: gap / best_score
        confident = False
        if len(sorted_results) >= 2:
            best = sorted_results[0]["score"]
            second = sorted_results[1]["score"]
            if best > 0.001:
                confident = (best - second) / best > 0.3
        tile_order = context.variants[best_variant] if best_variant is not None else []
        return SolverOutput(
            best_variant=best_variant,
            tile_order=tile_order,
            results=sorted_results,
            classification=classification,
            solver_name=self.name,
            confident=confident,
        )


class IconClickSolver(BaseCaptchaSolver):
    """Solver for icon-click captchas (type=1).

    Strategy:
    1. Extract individual icons from the iconsBase64 strip
    2. Template-match each icon on the main image
    3. Return center coordinates in left-to-right icon order
    """

    name = "icon_click"

    def solve(
        self,
        context: CaptchaContext,
        classification: CaptchaClassification,
        edge_trim: int,
        verbose: bool = True,
    ) -> SolverOutput:
        main_b64 = context.data.get("imageBase64") or context.puzzle.get("imageBase64", "")
        icons_b64 = context.data.get("iconsBase64") or context.puzzle.get("iconsBase64", "")

        if not main_b64 or not icons_b64:
            if verbose:
                print(f"[{self.name}] Missing imageBase64 or iconsBase64 - cannot solve")
            return SolverOutput(
                best_variant=None,
                tile_order=[],
                results=[],
                classification=classification,
                solver_name=self.name,
                confident=False,
                captcha_type=1,
            )

        _, coordinates, results = solve_icon_click(main_b64, icons_b64, verbose=verbose)

        confident = len(coordinates) >= 3
        return SolverOutput(
            best_variant=0,
            tile_order=coordinates,
            results=results,
            classification=classification,
            solver_name=self.name,
            confident=confident,
            captcha_type=1,
        )


DEFAULT_SOLVER = SeamMetricsSolver()
SOLVERS_BY_CLASSIFICATION = {
    "default": DEFAULT_SOLVER,
    "digit": DigitCaptchaSolver(),
    "figures": FigureCaptchaSolver(),
    "icon_click": IconClickSolver(),
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
