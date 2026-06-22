from src.captcha_solver_engine.digit_recognizer import (
    DigitPrediction,
    classification_from_saved_metadata,
    rank_variants_by_digit_predictions,
)
from src.captcha_solver_engine.models import CaptchaClassification, CaptchaContext, SolverOutput
import src.captcha_solver_engine.solvers as solvers_module
from src.captcha_solver_engine.solvers import DigitCaptchaSolver


def test_digit_prediction_ranking_uses_fallback_for_single_digit_ties():
    variants = [
        ["a", "x", "y"],
        ["b", "x", "y"],
        ["b", "z", "y"],
    ]
    fallback_results = [
        {"variant": 0, "score": 0.9},
        {"variant": 1, "score": 0.2},
        {"variant": 2, "score": 0.8},
    ]

    results = rank_variants_by_digit_predictions(
        variants,
        [DigitPrediction(tile_id="b", digit=1, margin=1.25)],
        fallback_results,
    )

    assert [item["variant"] for item in results[:3]] == [2, 1, 0]
    assert results[0]["digit_matches"] == 1
    assert results[0]["fallback_score"] == 0.8


def test_digit_solver_uses_single_recognizer_digit_without_seam_fallback(monkeypatch):
    context = CaptchaContext(
        data={},
        puzzle={},
        tiles=[],
        variants=[
            ["a", "x", "y"],
            ["b", "x", "y"],
            ["b", "z", "y"],
        ],
        images_dict={},
    )

    monkeypatch.setattr(
        solvers_module,
        "predict_confident_digits",
        lambda _context: [DigitPrediction(tile_id="b", digit=1, margin=1.25)],
    )

    def fake_seam_solve(_self, _context, _classification, _edge_trim, verbose=True):
        return SolverOutput(
            best_variant=0,
            tile_order=[],
            results=[
                {"variant": 0, "score": 0.9},
                {"variant": 1, "score": 0.2},
                {"variant": 2, "score": 0.8},
            ],
            classification=CaptchaClassification(kind="digit", confidence=1.0),
            solver_name="seam_metrics",
        )

    monkeypatch.setattr(solvers_module.SeamMetricsSolver, "solve", fake_seam_solve)

    result = DigitCaptchaSolver().solve(
        context,
        CaptchaClassification(kind="digit", confidence=1.0),
        edge_trim=1,
        verbose=False,
    )

    assert result.solver_name == "digit_solver:recognizer"
    assert result.best_variant == 2
    assert result.confident is False
    assert [item["variant"] for item in result.results[:3]] == [2, 1, 0]


def test_digit_solver_returns_no_signal_without_digit_predictions(monkeypatch):
    context = CaptchaContext(
        data={},
        puzzle={},
        tiles=[],
        variants=[["a"], ["b"]],
        images_dict={},
    )

    monkeypatch.setattr(solvers_module, "predict_confident_digits", lambda _context: [])

    def fail_seam_solve(*_args, **_kwargs):
        raise AssertionError("digit solver must not use seam fallback without digit signal")

    monkeypatch.setattr(solvers_module.SeamMetricsSolver, "solve", fail_seam_solve)

    real_import = __import__

    def fake_import(name, *args, **kwargs):
        if name == "easyocr":
            raise ImportError("blocked in test")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)

    result = DigitCaptchaSolver().solve(
        context,
        CaptchaClassification(kind="digit", confidence=1.0),
        edge_trim=1,
        verbose=False,
    )

    assert result.best_variant is None
    assert result.results == []
    assert result.confident is False


def test_digit_prediction_ranking_penalizes_conflicts():
    variants = [
        ["a", "b", "c"],
        ["b", "a", "c"],
        ["c", "b", "a"],
    ]

    results = rank_variants_by_digit_predictions(
        variants,
        [
            DigitPrediction(tile_id="a", digit=1, margin=1.0),
            DigitPrediction(tile_id="b", digit=2, margin=1.0),
        ],
        [{"variant": 1, "score": 100.0}],
    )

    assert results[0]["variant"] == 0
    assert results[0]["digit_matches"] == 2
    assert results[0]["digit_conflicts"] == 0
    assert results[1]["variant"] == 2
    assert results[-1]["variant"] == 1


def test_digit_solver_not_confident_when_best_variant_has_conflicts(monkeypatch):
    context = CaptchaContext(
        data={},
        puzzle={},
        tiles=[],
        variants=[
            ["a", "b", "c"],
            ["b", "a", "d"],
            ["c", "b", "a"],
        ],
        images_dict={},
    )
    monkeypatch.setattr(
        solvers_module,
        "predict_confident_digits",
        lambda _context: [
            DigitPrediction(tile_id="b", digit=1, margin=1.25),
            DigitPrediction(tile_id="a", digit=2, margin=1.10),
            DigitPrediction(tile_id="c", digit=3, margin=1.05),
        ],
    )

    def fake_seam_solve(_self, _context, _classification, _edge_trim, verbose=True):
        return SolverOutput(
            best_variant=0,
            tile_order=[],
            results=[{"variant": 0, "score": 0.9}, {"variant": 1, "score": 0.1}],
            classification=CaptchaClassification(kind="digit", confidence=1.0),
            solver_name="seam_metrics",
        )

    monkeypatch.setattr(solvers_module.SeamMetricsSolver, "solve", fake_seam_solve)

    result = DigitCaptchaSolver().solve(
        context,
        CaptchaClassification(kind="digit", confidence=1.0),
        edge_trim=1,
        verbose=False,
    )

    assert result.best_variant == 1
    assert result.results[0]["digit_matches"] == 2
    assert result.results[0]["digit_conflicts"] == 1
    assert result.confident is False


def test_saved_digit_classification_overrides_computed_default():
    computed = CaptchaClassification(kind="default", confidence=1.0)

    result = classification_from_saved_metadata({"classification": "digit"}, computed)

    assert result.kind == "digit"
    assert result.details["source"] == "saved_metadata"


def test_saved_unknown_classification_keeps_computed_result():
    computed = CaptchaClassification(kind="default", confidence=1.0)

    result = classification_from_saved_metadata({"classification": "unknown"}, computed)

    assert result is computed
