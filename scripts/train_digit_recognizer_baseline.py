"""Train baseline digit recognizers from captcha valid variant order.

The correct variant is treated as an ordering of digits 1..9: tile at position
0 is digit 1, position 1 is digit 2, and so on. This script compares:

1. Full-tile HOG + LinearSVC.
2. Best detected crop HOG + LinearSVC, using digit_bbox_baseline candidates.

It is an offline experiment and writes reports/models under
server/data/digit_recognizer_experiments.
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import pickle
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC
from skimage.feature import hog


ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
DB_PATH = SERVER / "data" / "api_keys.db"
OUT_ROOT = SERVER / "data" / "digit_recognizer_experiments"

sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(SERVER))

from digit_bbox_baseline import find_digit_candidates  # noqa: E402
from src.captcha_assembly import get_valid_variant_index, is_icon_click_type  # noqa: E402


def _read_digit_rows() -> list[sqlite3.Row]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        select id, captcha_id, classification, valid_index, file_path
        from captcha_files
        where classification = 'digit'
        order by id asc
        """
    ).fetchall()
    conn.close()
    return rows


def _load_json(row: sqlite3.Row) -> tuple[Path, dict[str, Any]]:
    path = Path(row["file_path"]) if row["file_path"] else SERVER / "data" / "captcha_examples" / "all" / f"{row['captcha_id']}.json"
    if not path.is_absolute():
        path = ROOT / path
    with open(path, encoding="utf-8") as f:
        return path, json.load(f)


def _decode_tile(tile: dict[str, Any]) -> Image.Image:
    raw = base64.b64decode(tile["imageData"])
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _extract_hog(image: Image.Image, size: tuple[int, int] = (64, 64)) -> np.ndarray:
    gray = np.array(image.convert("L").resize(size, Image.LANCZOS))
    return hog(
        gray,
        orientations=9,
        pixels_per_cell=(8, 8),
        cells_per_block=(2, 2),
        feature_vector=True,
    )


def _best_crop(image: Image.Image) -> tuple[Image.Image | None, dict[str, Any] | None]:
    candidates = find_digit_candidates(image)
    if not candidates:
        return None, None
    best = candidates[0]
    pad = 4
    x0 = max(0, best.x - pad)
    y0 = max(0, best.y - pad)
    x1 = min(image.width, best.x + best.w + pad)
    y1 = min(image.height, best.y + best.h + pad)
    return image.crop((x0, y0, x1, y1)), {
        "x": best.x,
        "y": best.y,
        "w": best.w,
        "h": best.h,
        "score": best.score,
        "source": best.source,
        "area_ratio": best.area_ratio,
    }


def build_dataset() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    samples: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for row in _read_digit_rows():
        try:
            path, data = _load_json(row)
        except Exception as exc:
            skipped.append({"captcha_id": row["captcha_id"], "reason": f"load_error: {exc!r}"})
            continue
        if is_icon_click_type(data):
            skipped.append({"captcha_id": row["captcha_id"], "reason": "icon_click"})
            continue
        vi = get_valid_variant_index(data)
        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", []) if isinstance(puzzle, dict) else []
        variants = puzzle.get("variantsCapture", []) if isinstance(puzzle, dict) else []
        if vi is None or not isinstance(tiles, list) or len(tiles) != 9 or not isinstance(variants, list):
            skipped.append({"captcha_id": row["captcha_id"], "reason": "no_training_label"})
            continue
        if vi < 0 or vi >= len(variants) or len(variants[vi]) != 9:
            skipped.append({"captcha_id": row["captcha_id"], "reason": "invalid_valid_variant"})
            continue

        tile_by_id = {tile.get("tileId"): tile for tile in tiles}
        for label_index, tile_id in enumerate(variants[vi], start=1):
            tile = tile_by_id.get(tile_id)
            if not tile:
                skipped.append({"captcha_id": row["captcha_id"], "reason": f"missing_tile:{tile_id}"})
                continue
            try:
                image = _decode_tile(tile)
            except Exception as exc:
                skipped.append({"captcha_id": row["captcha_id"], "reason": f"decode_error: {exc!r}"})
                continue
            crop, bbox = _best_crop(image)
            samples.append(
                {
                    "db_id": row["id"],
                    "captcha_id": row["captcha_id"],
                    "source_path": str(path),
                    "tile_id": tile_id,
                    "label": label_index,
                    "full_image": image,
                    "crop_image": crop,
                    "bbox": bbox,
                }
            )
    return samples, skipped


def _split_captcha_ids(samples: list[dict[str, Any]], test_mod: int = 5) -> tuple[set[str], set[str]]:
    captcha_ids = sorted({sample["captcha_id"] for sample in samples})
    test_ids = {cid for idx, cid in enumerate(captcha_ids) if idx % test_mod == 0}
    train_ids = set(captcha_ids) - test_ids
    return train_ids, test_ids


def _train_eval(samples: list[dict[str, Any]], image_key: str, train_ids: set[str], test_ids: set[str]) -> dict[str, Any]:
    usable = [sample for sample in samples if sample.get(image_key) is not None]
    train = [sample for sample in usable if sample["captcha_id"] in train_ids]
    test = [sample for sample in usable if sample["captcha_id"] in test_ids]
    x_train = np.array([_extract_hog(sample[image_key]) for sample in train])
    y_train = np.array([sample["label"] for sample in train])
    x_test = np.array([_extract_hog(sample[image_key]) for sample in test])
    y_test = np.array([sample["label"] for sample in test])

    model = make_pipeline(StandardScaler(), LinearSVC(class_weight="balanced", C=0.5, max_iter=10000))
    model.fit(x_train, y_train)
    pred = model.predict(x_test)
    scores = model.decision_function(x_test)
    margins = np.sort(scores, axis=1)[:, -1] - np.sort(scores, axis=1)[:, -2]

    predictions = []
    for sample, expected, actual, margin in zip(test, y_test, pred, margins, strict=True):
        predictions.append(
            {
                "captcha_id": sample["captcha_id"],
                "db_id": sample["db_id"],
                "tile_id": sample["tile_id"],
                "expected": int(expected),
                "predicted": int(actual),
                "correct": bool(expected == actual),
                "margin": float(margin),
                "bbox": sample.get("bbox"),
            }
        )

    by_margin = {}
    for threshold in (0.5, 1.0, 1.5, 2.0):
        confident = [item for item in predictions if item["margin"] >= threshold]
        by_margin[str(threshold)] = {
            "count": len(confident),
            "accuracy": sum(1 for item in confident if item["correct"]) / len(confident) if confident else None,
        }

    return {
        "model": model,
        "train_count": len(train),
        "test_count": len(test),
        "captcha_train_count": len(train_ids),
        "captcha_test_count": len(test_ids),
        "accuracy": float(accuracy_score(y_test, pred)) if len(test) else None,
        "classification_report": classification_report(y_test, pred, labels=list(range(1, 10)), zero_division=0, output_dict=True),
        "confusion_matrix": confusion_matrix(y_test, pred, labels=list(range(1, 10))).tolist(),
        "by_margin": by_margin,
        "predictions": predictions,
    }


def _train_final(samples: list[dict[str, Any]], image_key: str):
    usable = [sample for sample in samples if sample.get(image_key) is not None]
    x_train = np.array([_extract_hog(sample[image_key]) for sample in usable])
    y_train = np.array([sample["label"] for sample in usable])
    model = make_pipeline(StandardScaler(), LinearSVC(class_weight="balanced", C=0.5, max_iter=10000))
    model.fit(x_train, y_train)
    return model


def _all_digit_tiles_for_inference() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    tiles: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for row in _read_digit_rows():
        try:
            path, data = _load_json(row)
        except Exception as exc:
            skipped.append({"captcha_id": row["captcha_id"], "reason": f"load_error: {exc!r}"})
            continue
        if is_icon_click_type(data):
            skipped.append({"captcha_id": row["captcha_id"], "reason": "icon_click"})
            continue
        puzzle = data.get("puzzle", data)
        source_tiles = puzzle.get("tiles", []) if isinstance(puzzle, dict) else []
        if not isinstance(source_tiles, list) or len(source_tiles) != 9:
            skipped.append({"captcha_id": row["captcha_id"], "reason": "not_9_tile_puzzle"})
            continue
        for index, tile in enumerate(source_tiles):
            try:
                image = _decode_tile(tile)
            except Exception as exc:
                skipped.append({"captcha_id": row["captcha_id"], "tile_index": index, "reason": f"decode_error: {exc!r}"})
                continue
            tiles.append(
                {
                    "db_id": row["id"],
                    "captcha_id": row["captcha_id"],
                    "tile_index": index,
                    "tile_id": tile.get("tileId"),
                    "valid_index": get_valid_variant_index(data),
                    "source_path": str(path),
                    "full_image": image,
                }
            )
    return tiles, skipped


def _run_inference(model, tiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    features = np.array([_extract_hog(tile["full_image"]) for tile in tiles])
    predicted = model.predict(features)
    scores = model.decision_function(features)
    sorted_scores = np.sort(scores, axis=1)
    margins = sorted_scores[:, -1] - sorted_scores[:, -2]
    results = []
    for tile, label, margin in zip(tiles, predicted, margins, strict=True):
        results.append(
            {
                "db_id": tile["db_id"],
                "captcha_id": tile["captcha_id"],
                "tile_index": tile["tile_index"],
                "tile_id": tile["tile_id"],
                "valid_index": tile["valid_index"],
                "predicted_digit": int(label),
                "margin": float(margin),
                "confident_0_5": bool(margin >= 0.5),
                "confident_1_0": bool(margin >= 1.0),
                "confident_1_5": bool(margin >= 1.5),
                "source_path": tile["source_path"],
            }
        )
    return results


def run(test_mod: int = 5) -> dict[str, Any]:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUT_ROOT / f"run_{ts}"
    out_dir.mkdir(parents=True, exist_ok=True)

    samples, skipped = build_dataset()
    train_ids, test_ids = _split_captcha_ids(samples, test_mod=test_mod)
    full_eval = _train_eval(samples, "full_image", train_ids, test_ids)
    crop_eval = _train_eval(samples, "crop_image", train_ids, test_ids)
    final_full_model = _train_final(samples, "full_image")
    inference_tiles, inference_skipped = _all_digit_tiles_for_inference()
    inference = _run_inference(final_full_model, inference_tiles)
    confident_by_captcha = {}
    for threshold in (0.5, 1.0, 1.5, 2.0):
        key = str(threshold)
        per_captcha = Counter(
            item["captcha_id"]
            for item in inference
            if item["margin"] >= threshold
        )
        confident_by_captcha[key] = dict(per_captcha)

    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "db_path": str(DB_PATH),
        "out_dir": str(out_dir),
        "samples_total": len(samples),
        "captcha_count": len({sample["captcha_id"] for sample in samples}),
        "skipped": skipped,
        "label_counts": dict(Counter(sample["label"] for sample in samples)),
        "crop_available": sum(1 for sample in samples if sample["crop_image"] is not None),
        "inference_tiles": len(inference),
        "inference_skipped": inference_skipped,
        "inference_confident_counts": {
            "0.5": sum(1 for item in inference if item["margin"] >= 0.5),
            "1.0": sum(1 for item in inference if item["margin"] >= 1.0),
            "1.5": sum(1 for item in inference if item["margin"] >= 1.5),
            "2.0": sum(1 for item in inference if item["margin"] >= 2.0),
        },
        "inference_confident_by_captcha": confident_by_captcha,
        "full_tile": {key: value for key, value in full_eval.items() if key not in ("model", "predictions")},
        "crop": {key: value for key, value in crop_eval.items() if key not in ("model", "predictions")},
    }

    report = {
        "summary": summary,
        "full_tile_predictions": full_eval["predictions"],
        "crop_predictions": crop_eval["predictions"],
        "inference": inference,
    }
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    with open(out_dir / "full_tile_predictions.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(full_eval["predictions"][0].keys()))
        writer.writeheader()
        writer.writerows(full_eval["predictions"])
    with open(out_dir / "crop_predictions.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(crop_eval["predictions"][0].keys()))
        writer.writeheader()
        writer.writerows(crop_eval["predictions"])
    with open(out_dir / "inference_all_digit_tiles.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(inference[0].keys()))
        writer.writeheader()
        writer.writerows(inference)

    with open(out_dir / "full_tile_model.pkl", "wb") as f:
        pickle.dump(full_eval["model"], f)
    with open(out_dir / "crop_model.pkl", "wb") as f:
        pickle.dump(crop_eval["model"], f)
    with open(out_dir / "final_full_tile_model.pkl", "wb") as f:
        pickle.dump(final_full_model, f)

    with open(out_dir / "summary.txt", "w", encoding="utf-8") as f:
        f.write(f"Digit recognizer baseline {ts}\n")
        f.write("=" * 80 + "\n")
        f.write(json.dumps(summary, ensure_ascii=False, indent=2))

    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-mod", type=int, default=5)
    args = parser.parse_args()
    summary = run(test_mod=args.test_mod)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
