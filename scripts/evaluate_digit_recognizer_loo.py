"""Leave-one-captcha-out evaluation for the digit recognizer.

Each fold trains on all digit captchas except one held-out captcha, then
predicts the held-out captcha's tile digits and ranks captcha variants. This
estimates behavior on unseen captchas better than testing the final model on
the same captchas it was trained on.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
OUT_ROOT = SERVER / "data" / "digit_recognizer_evaluations"

sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(SERVER))

from train_digit_recognizer_baseline import _extract_hog, _load_json, _read_digit_rows, build_dataset  # noqa: E402
from src.captcha_assembly import get_valid_variant_index  # noqa: E402
from src.captcha_solver_engine.classifier import CaptchaClassification  # noqa: E402
from src.captcha_solver_engine.common import build_captcha_context  # noqa: E402
from src.captcha_solver_engine.digit_recognizer import DigitPrediction, rank_variants_by_digit_predictions  # noqa: E402
from src.captcha_solver_engine.solvers import SeamMetricsSolver  # noqa: E402


THRESHOLDS = (0.5, 1.0, 1.5, 2.0)


def _train_model(samples: list[dict[str, Any]], holdout_id: str):
    train = [sample for sample in samples if sample["captcha_id"] != holdout_id]
    x_train = np.array([_extract_hog(sample["full_image"]) for sample in train])
    y_train = np.array([sample["label"] for sample in train])
    model = make_pipeline(StandardScaler(), LinearSVC(class_weight="balanced", C=0.5, max_iter=10000))
    model.fit(x_train, y_train)
    return model


def _predict_holdout(model, heldout: list[dict[str, Any]]) -> list[dict[str, Any]]:
    x_test = np.array([_extract_hog(sample["full_image"]) for sample in heldout])
    labels = model.predict(x_test)
    scores = model.decision_function(x_test)
    sorted_scores = np.sort(scores, axis=1)
    margins = sorted_scores[:, -1] - sorted_scores[:, -2]

    predictions = []
    for sample, predicted, margin in zip(heldout, labels, margins, strict=True):
        predictions.append(
            {
                "tile_id": sample["tile_id"],
                "expected_digit": int(sample["label"]),
                "predicted_digit": int(predicted),
                "tile_correct": int(sample["label"]) == int(predicted),
                "margin": float(margin),
            }
        )
    return predictions


def _load_captcha_data(captcha_id: str) -> dict[str, Any]:
    row_by_id = {row["captcha_id"]: row for row in _read_digit_rows()}
    _path, data = _load_json(row_by_id[captcha_id])
    return data


def _rank_for_threshold(
    data: dict[str, Any],
    predictions: list[dict[str, Any]],
    threshold: float,
) -> dict[str, Any]:
    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", []) if isinstance(puzzle, dict) else []
    valid_index = get_valid_variant_index(data)
    digit_predictions = [
        DigitPrediction(
            tile_id=item["tile_id"],
            digit=item["predicted_digit"],
            margin=item["margin"],
        )
        for item in predictions
        if 1 <= item["predicted_digit"] <= 9 and item["margin"] >= threshold
    ]

    if digit_predictions:
        context = build_captcha_context(data)
        classification = CaptchaClassification(kind="digit", confidence=1.0)
        fallback = SeamMetricsSolver().solve(context, classification, edge_trim=1, verbose=False)
        results = rank_variants_by_digit_predictions(variants, digit_predictions, fallback.results)
        top3 = [int(item["variant"]) for item in results[:3] if isinstance(item.get("variant"), int)]
        best_variant = top3[0] if top3 else None
        best_matches = int(results[0]["digit_matches"]) if results else 0
        best_conflicts = int(results[0]["digit_conflicts"]) if results else 0
        solver_name = "digit_solver:recognizer"
        confident = best_matches >= 2
    else:
        results = []
        top3 = []
        best_variant = None
        best_matches = 0
        best_conflicts = 0
        solver_name = "digit_solver"
        confident = False

    return {
        "threshold": threshold,
        "valid_index": valid_index,
        "best_variant": best_variant,
        "top3": top3,
        "top1_hit": best_variant == valid_index if valid_index is not None else None,
        "top3_hit": valid_index in top3 if valid_index is not None else None,
        "prediction_count": len(digit_predictions),
        "best_matches": best_matches,
        "best_conflicts": best_conflicts,
        "confident": confident,
        "solver_name": solver_name,
        "results": results[:5],
    }


def _summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    summary_by_threshold = {}
    for threshold in THRESHOLDS:
        subset = [record for record in records if record["threshold"] == threshold]
        answered = [record for record in subset if record["best_variant"] is not None]
        confident = [record for record in subset if record["confident"]]
        single_digit = [record for record in subset if record["prediction_count"] == 1]
        no_signal = [record for record in subset if record["prediction_count"] == 0]

        def rate(items: list[dict[str, Any]], key: str) -> float | None:
            return sum(1 for item in items if item[key]) / len(items) if items else None

        summary_by_threshold[str(threshold)] = {
            "count": len(subset),
            "answered": len(answered),
            "no_signal": len(no_signal),
            "top1_hits": sum(1 for item in subset if item["top1_hit"]),
            "top3_hits": sum(1 for item in subset if item["top3_hit"]),
            "top1_rate_all": rate(subset, "top1_hit"),
            "top3_rate_all": rate(subset, "top3_hit"),
            "top1_rate_answered": rate(answered, "top1_hit"),
            "top3_rate_answered": rate(answered, "top3_hit"),
            "confident_count": len(confident),
            "confident_top1_rate": rate(confident, "top1_hit"),
            "confident_top3_rate": rate(confident, "top3_hit"),
            "single_digit_count": len(single_digit),
            "single_digit_top1_rate": rate(single_digit, "top1_hit"),
            "single_digit_top3_rate": rate(single_digit, "top3_hit"),
        }
    return summary_by_threshold


def main() -> None:
    samples, skipped = build_dataset()
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sample in samples:
        grouped[sample["captcha_id"]].append(sample)
    captcha_ids = sorted(cid for cid, group in grouped.items() if len(group) == 9)

    data_by_id = {captcha_id: _load_captcha_data(captcha_id) for captcha_id in captcha_ids}
    records = []
    tile_predictions = []
    for index, captcha_id in enumerate(captcha_ids, start=1):
        print(f"[{index}/{len(captcha_ids)}] leave out {captcha_id}", flush=True)
        model = _train_model(samples, captcha_id)
        predictions = _predict_holdout(model, grouped[captcha_id])
        tile_predictions.extend(
            {
                **item,
                "captcha_id": captcha_id,
            }
            for item in predictions
        )
        for threshold in THRESHOLDS:
            ranked = _rank_for_threshold(data_by_id[captcha_id], predictions, threshold)
            records.append(
                {
                    "captcha_id": captcha_id,
                    **ranked,
                    "tile_predictions": predictions,
                }
            )

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUT_ROOT / f"loo_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "captcha_count": len(captcha_ids),
        "sample_count": len(samples),
        "skipped": skipped,
        "thresholds": list(THRESHOLDS),
        "by_threshold": _summarize(records),
    }
    report = {
        "summary": summary,
        "records": records,
        "tile_predictions": tile_predictions,
    }
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "summary.txt").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    with (out_dir / "records.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "captcha_id",
                "threshold",
                "valid_index",
                "best_variant",
                "top3",
                "top1_hit",
                "top3_hit",
                "prediction_count",
                "best_matches",
                "best_conflicts",
                "confident",
                "solver_name",
            ],
        )
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    **{key: record[key] for key in writer.fieldnames if key not in {"top3"}},
                    "top3": " ".join(map(str, record["top3"])),
                }
            )

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(out_dir)


if __name__ == "__main__":
    main()
