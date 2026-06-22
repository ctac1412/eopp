"""Chronological 2/3 train, 1/3 test evaluation for digit captchas."""

from __future__ import annotations

import csv
import json
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
DB_PATH = SERVER / "data" / "api_keys.db"
OUT_ROOT = SERVER / "data" / "digit_recognizer_evaluations"

sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(SERVER))

from train_digit_recognizer_baseline import _extract_hog, _load_json, build_dataset  # noqa: E402
from src.captcha_assembly import get_valid_variant_index  # noqa: E402
from src.captcha_solver_engine.classifier import CaptchaClassification  # noqa: E402
from src.captcha_solver_engine.common import build_captcha_context  # noqa: E402
from src.captcha_solver_engine.digit_recognizer import DigitPrediction, rank_variants_by_digit_predictions  # noqa: E402
from src.captcha_solver_engine.solvers import SeamMetricsSolver  # noqa: E402


THRESHOLD = 1.0


def _digit_rows_by_time() -> list[sqlite3.Row]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        select id, captcha_id, created_at, file_path, valid_index
        from captcha_files
        where classification = 'digit' and valid_index is not null
        order by datetime(created_at) asc, id asc
        """
    ).fetchall()
    conn.close()
    return rows


def _train_model(samples: list[dict[str, Any]], train_ids: set[str]):
    train = [sample for sample in samples if sample["captcha_id"] in train_ids]
    x_train = np.array([_extract_hog(sample["full_image"]) for sample in train])
    y_train = np.array([sample["label"] for sample in train])
    model = make_pipeline(StandardScaler(), LinearSVC(class_weight="balanced", C=0.5, max_iter=10000))
    model.fit(x_train, y_train)
    return model


def _predict_tiles(model, samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    x = np.array([_extract_hog(sample["full_image"]) for sample in samples])
    labels = model.predict(x)
    scores = model.decision_function(x)
    sorted_scores = np.sort(scores, axis=1)
    margins = sorted_scores[:, -1] - sorted_scores[:, -2]
    return [
        {
            "tile_id": sample["tile_id"],
            "expected_digit": int(sample["label"]),
            "predicted_digit": int(label),
            "tile_correct": int(sample["label"]) == int(label),
            "margin": float(margin),
        }
        for sample, label, margin in zip(samples, labels, margins, strict=True)
    ]


def _rank(data: dict[str, Any], predictions: list[dict[str, Any]]) -> dict[str, Any]:
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
        if 1 <= item["predicted_digit"] <= 9 and item["margin"] >= THRESHOLD
    ]

    if not digit_predictions:
        return {
            "valid_index": valid_index,
            "best_variant": None,
            "top3": [],
            "answered": False,
            "confident": False,
            "prediction_count": 0,
            "best_matches": 0,
            "best_conflicts": 0,
            "top1_hit": False,
            "top3_hit": False,
        }

    context = build_captcha_context(data)
    classification = CaptchaClassification(kind="digit", confidence=1.0)
    fallback = SeamMetricsSolver().solve(context, classification, edge_trim=1, verbose=False)
    results = rank_variants_by_digit_predictions(variants, digit_predictions, fallback.results)
    top3 = [int(item["variant"]) for item in results[:3] if isinstance(item.get("variant"), int)]
    best_variant = top3[0] if top3 else None
    best_matches = int(results[0]["digit_matches"]) if results else 0
    best_conflicts = int(results[0]["digit_conflicts"]) if results else 0
    return {
        "valid_index": valid_index,
        "best_variant": best_variant,
        "top3": top3,
        "answered": best_variant is not None,
        "confident": best_matches >= 2,
        "prediction_count": len(digit_predictions),
        "best_matches": best_matches,
        "best_conflicts": best_conflicts,
        "top1_hit": best_variant == valid_index,
        "top3_hit": valid_index in top3,
    }


def _rate(items: list[dict[str, Any]], key: str) -> float | None:
    return sum(1 for item in items if item.get(key)) / len(items) if items else None


def _summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    result = {}
    for split in ("train", "test", "all"):
        subset = records if split == "all" else [record for record in records if record["split"] == split]
        answered = [record for record in subset if record["answered"]]
        confident = [record for record in subset if record["confident"]]
        result[split] = {
            "count": len(subset),
            "answered": len(answered),
            "no_signal": len(subset) - len(answered),
            "top1_hits": sum(1 for item in subset if item["top1_hit"]),
            "top3_hits": sum(1 for item in subset if item["top3_hit"]),
            "top1_rate_all": _rate(subset, "top1_hit"),
            "top3_rate_all": _rate(subset, "top3_hit"),
            "top1_rate_answered": _rate(answered, "top1_hit"),
            "top3_rate_answered": _rate(answered, "top3_hit"),
            "confident_count": len(confident),
            "confident_top1_rate": _rate(confident, "top1_hit"),
            "confident_top3_rate": _rate(confident, "top3_hit"),
        }
    return result


def main() -> None:
    rows = _digit_rows_by_time()
    test_ids = {row["captcha_id"] for index, row in enumerate(rows) if index % 3 == 2}
    train_ids = {row["captcha_id"] for row in rows} - test_ids
    split_by_id = {captcha_id: "train" for captcha_id in train_ids}
    split_by_id.update({captcha_id: "test" for captcha_id in test_ids})

    samples, skipped = build_dataset()
    samples_by_id: dict[str, list[dict[str, Any]]] = {}
    for sample in samples:
        samples_by_id.setdefault(sample["captcha_id"], []).append(sample)

    model = _train_model(samples, train_ids)
    records = []
    for row in rows:
        captcha_id = row["captcha_id"]
        if captcha_id not in samples_by_id or len(samples_by_id[captcha_id]) != 9:
            continue
        _path, data = _load_json(row)
        predictions = _predict_tiles(model, samples_by_id[captcha_id])
        ranked = _rank(data, predictions)
        records.append(
            {
                "id": row["id"],
                "captcha_id": captcha_id,
                "created_at": row["created_at"],
                "split": split_by_id[captcha_id],
                **ranked,
                "tile_accuracy": sum(1 for item in predictions if item["tile_correct"]) / len(predictions),
                "tile_predictions": predictions,
            }
        )

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUT_ROOT / f"time_split_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "threshold": THRESHOLD,
        "train_captchas": len(train_ids),
        "test_captchas": len(test_ids),
        "split_rule": "order by created_at asc, id asc; every third captcha (index % 3 == 2) is test",
        "label_counts": Counter(sample["label"] for sample in samples if sample["captcha_id"] in train_ids),
        "skipped": skipped,
        "metrics": _summarize(records),
    }
    summary["label_counts"] = {str(key): int(value) for key, value in sorted(summary["label_counts"].items())}

    report = {"summary": summary, "records": records}
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "summary.txt").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    with (out_dir / "records.csv").open("w", encoding="utf-8", newline="") as f:
        fields = [
            "id",
            "captcha_id",
            "created_at",
            "split",
            "valid_index",
            "best_variant",
            "top3",
            "answered",
            "confident",
            "prediction_count",
            "best_matches",
            "best_conflicts",
            "top1_hit",
            "top3_hit",
            "tile_accuracy",
        ]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for record in records:
            row = {key: record[key] for key in fields if key != "top3"}
            row["top3"] = " ".join(map(str, record["top3"]))
            writer.writerow(row)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(out_dir)


if __name__ == "__main__":
    main()
