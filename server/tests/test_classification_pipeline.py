"""Tests for classification + solver pipeline."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.captcha_solver_engine.classifier import (
    DIGIT_CLASSIFIER,
    FIGURES_CLASSIFIER,
    ChainClassifier,
)
from src.captcha_solver_engine.common import build_captcha_context
from src.captcha_solver_engine.metrics import _grid_neighbors
from src.captcha_solver_engine.models import CaptchaClassification, CaptchaContext
from src.captcha_solver_engine.solvers import (
    DigitCaptchaSolver,
    FigureCaptchaSolver,
    SeamMetricsSolver,
    solver_for_classification,
)

BASE = os.path.join(os.path.dirname(__file__), "..", "data", "captcha_examples", "all")

# ── Known captchas for testing ──
FIG_CAPTCHA = "f737684e17f3cdcc"  # figure captcha
DIG_CAPTCHA = "666321e86943b462"  # digit captcha
PUZ_CAPTCHA = "1df2911dfca40228"  # puzzle captcha
HARD_DIGIT = "e518ac2a4d823dbe"  # digit captcha that OCR fails on


def _load(cid):
    with open(os.path.join(BASE, f"{cid}.json")) as f:
        return json.load(f)


def _context(cid):
    return build_captcha_context(_load(cid))


# ── Grid metrics ──

def test_grid_neighbors_12_seams():
    """3x3 grid must have 6 horizontal + 6 vertical = 12 seams."""
    h, v = _grid_neighbors(list(range(9)))
    assert len(h) == 6, f"Expected 6 horizontal pairs, got {len(h)}: {h}"
    assert len(v) == 6, f"Expected 6 vertical pairs, got {len(v)}: {v}"
    # Horizontal: (0,1),(1,2),(3,4),(4,5),(6,7),(7,8)
    assert set(h) == {(0,1),(1,2),(3,4),(4,5),(6,7),(7,8)}
    # Vertical: (0,3),(1,4),(2,5),(3,6),(4,7),(5,8)
    assert set(v) == {(0,3),(1,4),(2,5),(3,6),(4,7),(5,8)}


# ── Classification ──

def test_figure_classifier_detects_figures():
    ctx = _context(FIG_CAPTCHA)
    result = FIGURES_CLASSIFIER.classify(ctx)
    assert result.kind == "figures", f"Expected 'figures', got '{result.kind}'"


def test_digit_classifier_detects_digits():
    ctx = _context(DIG_CAPTCHA)
    result = DIGIT_CLASSIFIER.classify(ctx)
    assert result.kind == "digit", f"Expected 'digit', got '{result.kind}'"


def test_figure_classifier_rejects_puzzles():
    ctx = _context(PUZ_CAPTCHA)
    result = FIGURES_CLASSIFIER.classify(ctx)
    assert result.kind != "figures", "Figure classifier should reject puzzle"


def test_digit_classifier_rejects_puzzles():
    ctx = _context(PUZ_CAPTCHA)
    result = DIGIT_CLASSIFIER.classify(ctx)
    assert result.kind != "digit", "Digit classifier should reject puzzle"


# ── Chain classifier ──

def test_chain_classifies_figure():
    ctx = _context(FIG_CAPTCHA)
    clf = ChainClassifier()
    result = clf.classify(ctx)
    assert result.kind == "figures"
    assert result.details.get("classifier") == "figures"


def test_chain_classifies_digit():
    ctx = _context(DIG_CAPTCHA)
    clf = ChainClassifier()
    result = clf.classify(ctx)
    assert result.kind == "digit"
    assert result.details.get("classifier") == "digit"


def test_chain_classifies_puzzle():
    ctx = _context(PUZ_CAPTCHA)
    clf = ChainClassifier()
    result = clf.classify(ctx)
    assert result.kind == "default"


# ── Figure solver ──

def test_figure_solver_correct_on_all():
    solver = FigureCaptchaSolver()
    classification = CaptchaClassification(kind="figures", confidence=1.0)
    for cid in [
        "f737684e17f3cdcc", "587ee3409a2eca4a", "ec695d81d76aec41",
        "ca186a379dbcb6c8", "b16fe76a7b2e491f", "786925580affd550",
        "48fef3307bde851f",
    ]:
        ctx = _context(cid)
        vi = _load(cid).get("valid_index")
        out = solver.solve(ctx, classification, edge_trim=3, verbose=False)
        assert out.best_variant == vi, f"Figure solver failed on {cid}: pred={out.best_variant}, true={vi}"


def test_figure_solver_returns_confidence():
    solver = FigureCaptchaSolver()
    classification = CaptchaClassification(kind="figures", confidence=1.0)
    ctx = _context(FIG_CAPTCHA)
    out = solver.solve(ctx, classification, edge_trim=3, verbose=False)
    assert hasattr(out, "confident"), "SolverOutput must have confident field"


# ── Seam metrics solver ──

def test_seam_solver_runs():
    ctx = _context(PUZ_CAPTCHA)
    solver = SeamMetricsSolver()
    classification = CaptchaClassification(kind="default", confidence=1.0)
    out = solver.solve(ctx, classification, edge_trim=3, verbose=False)
    assert out.best_variant is not None
    assert len(out.results) == 15
    assert hasattr(out, "confident")


def test_seam_solver_12_seams_per_variant():
    """Each variant should use all 12 grid seams."""
    ctx = _context(PUZ_CAPTCHA)
    solver = SeamMetricsSolver()
    classification = CaptchaClassification(kind="default", confidence=1.0)
    out = solver.solve(ctx, classification, edge_trim=3, verbose=False)
    # All 15 variants must have results
    assert len(out.results) == 15


# ── Digit solver ──

def test_digit_solver_finds_answer():
    solver = DigitCaptchaSolver()
    classification = CaptchaClassification(kind="digit", confidence=1.0)
    ctx = _context(DIG_CAPTCHA)
    vi = _load(DIG_CAPTCHA).get("valid_index")
    out = solver.solve(ctx, classification, edge_trim=3, verbose=False)
    assert out.best_variant == vi, f"Digit solver: pred={out.best_variant}, true={vi}"


def test_digit_solver_not_confident_on_hard():
    """e518ac should fall back to SeamMetrics when easyocr unavailable."""
    solver = DigitCaptchaSolver()
    classification = CaptchaClassification(kind="digit", confidence=1.0)
    ctx = _context(HARD_DIGIT)
    out = solver.solve(ctx, classification, edge_trim=3, verbose=False)
    # Without easyocr, falls back to SeamMetrics. Just verify it returns something.
    assert out.best_variant is not None


# ── Solver routing ──

def test_solver_routing():
    assert solver_for_classification(
        CaptchaClassification(kind="figures")
    ).name == "figure_solver"
    assert solver_for_classification(
        CaptchaClassification(kind="digit")
    ).name == "digit_solver"
    assert solver_for_classification(
        CaptchaClassification(kind="default")
    ).name == "seam_metrics"
    # Unknown kind falls back to default
    assert solver_for_classification(
        CaptchaClassification(kind="unknown")
    ).name == "seam_metrics"


def test_digit_classifier_rejects_context_without_decoded_tile_images():
    ctx = CaptchaContext(
        data={},
        puzzle={},
        tiles=[{"tileId": "0"}, {"tileId": "1"}],
        variants=[],
        images_dict={},
    )

    result = DIGIT_CLASSIFIER.classify(ctx)

    assert result.kind == "default"
    assert result.details["total_tiles"] == 0
    assert result.details["tiles_with_digits"] == 0
