"""Train tile classifier for digit captcha detection.

Usage:
    python -m src.captcha_solver_engine.train

Artifacts produced:
    models/tile_classifier.pkl  — {'scaler': StandardScaler, 'clf': LinearSVC}
"""

from __future__ import annotations

import json
import os
import pickle
import sqlite3
from io import BytesIO

import numpy as np
from PIL import Image
from skimage.feature import hog
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC

from src.constants import PROJECT_DIR

DB_PATH = os.environ.get(
    "EOPP_DB_PATH",
    os.path.join(PROJECT_DIR, "prod", "data", "api_keys.db"),
)
CAPTCHA_DIR = os.environ.get(
    "EOPP_CAPTCHA_DIR",
    os.path.join(PROJECT_DIR, "prod", "data", "captcha_examples", "all"),
)
MODEL_PATH = os.environ.get(
    "EOPP_TILE_MODEL_PATH",
    os.path.join(PROJECT_DIR, "models", "tile_classifier.pkl"),
)
MODELS_DIR = os.path.join(PROJECT_DIR, "models")

# HOG parameters
TILE_SIZE = (64, 36)
HOG_ORIENTATIONS = 9
HOG_PIXELS_PER_CELL = (8, 8)
HOG_CELLS_PER_BLOCK = (2, 2)

# Captcha-level threshold: how many tiles must be classified as digit
TILE_VOTE_THRESHOLD = 5


def load_ground_truth(db_path: str = DB_PATH) -> dict[str, str]:
    """Load classification labels from captcha_files table."""
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT captcha_id, classification FROM captcha_files WHERE classification IS NOT NULL"
    ).fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}


def extract_tiles(captcha_dir: str = CAPTCHA_DIR, gt: dict[str, str] | None = None) -> tuple[np.ndarray, np.ndarray, list]:
    """Extract HOG features and labels from all labeled captcha tiles.

    Returns (X, y, captcha_info) where:
        X: (n_tiles, n_features) feature matrix
        y: (n_tiles,) labels (1=digit, 0=puzzle)
        captcha_info: list of (captcha_id, label, tile_indices) for captcha-level evaluation
    """
    if gt is None:
        gt = load_ground_truth()

    features_list = []
    labels_list = []
    captcha_info = []

    for fname in sorted(os.listdir(captcha_dir)):
        if not fname.endswith(".json"):
            continue
        cid = fname.replace(".json", "")
        label = gt.get(cid)
        if label is None:
            continue

        path = os.path.join(captcha_dir, fname)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", [])
        tile_indices = []

        for tile in tiles:
            try:
                from base64 import b64decode
                img = Image.open(BytesIO(b64decode(tile["imageData"]))).convert("L")
                arr = np.array(img)
                arr_rs = np.array(Image.fromarray(arr).resize(TILE_SIZE, Image.LANCZOS))
                fd = hog(arr_rs, orientations=HOG_ORIENTATIONS,
                         pixels_per_cell=HOG_PIXELS_PER_CELL,
                         cells_per_block=HOG_CELLS_PER_BLOCK,
                         feature_vector=True)
                features_list.append(fd)
                labels_list.append(1 if label == "digit" else 0)
                tile_indices.append(len(features_list) - 1)
            except Exception:
                pass

        captcha_info.append((cid, label, tile_indices))

    X = np.array(features_list)
    y = np.array(labels_list)
    return X, y, captcha_info


def cross_validate(X: np.ndarray, y: np.ndarray, captcha_info: list, n_splits: int = 5) -> dict:
    """Captcha-level stratified cross-validation.

    Returns dict with accuracy, precision, recall, f1, confusion matrix.
    """
    captcha_labels = [1 if lbl == "digit" else 0 for _, lbl, _ in captcha_info]
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    all_preds = []
    all_trues = []

    for train_idx, test_idx in skf.split(range(len(captcha_info)), captcha_labels):
        train_tiles = []
        test_tiles = []
        for ci in train_idx:
            train_tiles.extend(captcha_info[ci][2])
        for ci in test_idx:
            test_tiles.extend(captcha_info[ci][2])

        X_tr, X_te = X[train_tiles], X[test_tiles]
        y_tr, y_te = y[train_tiles], y[test_tiles]

        scaler = StandardScaler()
        clf = LinearSVC(C=0.01, class_weight="balanced", max_iter=5000, random_state=42)
        clf.fit(scaler.fit_transform(X_tr), y_tr)

        y_pred = clf.predict(scaler.transform(X_te))

        offset = 0
        for ci in test_idx:
            _, lbl, trange = captcha_info[ci]
            n_t = len(trange)
            tile_preds = y_pred[offset:offset + n_t]
            offset += n_t
            pred = 1 if int(tile_preds.sum()) >= TILE_VOTE_THRESHOLD else 0
            all_preds.append(pred)
            all_trues.append(1 if lbl == "digit" else 0)

    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

    return {
        "accuracy": float(accuracy_score(all_trues, all_preds)),
        "precision": float(precision_score(all_trues, all_preds, zero_division=0)),
        "recall": float(recall_score(all_trues, all_preds, zero_division=0)),
        "f1": float(f1_score(all_trues, all_preds, zero_division=0)),
        "confusion": confusion_matrix(all_trues, all_preds).tolist(),
    }


def save_model(scaler: StandardScaler, clf: LinearSVC, name: str = "hog_svm") -> str:
    """Save model to data/models/{name}_v{version}.pkl, auto-incrementing version."""
    os.makedirs(MODELS_DIR, exist_ok=True)

    # Find next version
    existing = [f for f in os.listdir(MODELS_DIR) if f.startswith(f"{name}_v") and f.endswith(".pkl")]
    versions = []
    for f in existing:
        try:
            v = int(f.replace(f"{name}_v", "").replace(".pkl", ""))
            versions.append(v)
        except ValueError:
            pass
    version = max(versions) + 1 if versions else 1

    path = os.path.join(MODELS_DIR, f"{name}_v{version}.pkl")
    with open(path, "wb") as f:
        pickle.dump({"scaler": scaler, "clf": clf, "name": name, "version": version}, f)

    # Also save as default model for production use
    default_path = os.path.join(PROJECT_DIR, "models", "tile_classifier.pkl")
    with open(default_path, "wb") as f:
        pickle.dump({"scaler": scaler, "clf": clf, "name": name, "version": version}, f)

    return path


def list_models() -> list[dict]:
    """List all trained models in data/models/."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    models = []
    for fname in sorted(os.listdir(MODELS_DIR)):
        if not fname.endswith(".pkl"):
            continue
        stem = fname.replace(".pkl", "")
        if "_v" not in stem:
            continue
        name, ver_str = stem.rsplit("_v", 1)
        try:
            version = int(ver_str)
        except ValueError:
            continue
        path = os.path.join(MODELS_DIR, fname)
        size = os.path.getsize(path)
        mtime = os.path.getmtime(path)
        models.append({
            "name": name,
            "version": version,
            "filename": fname,
            "path": path,
            "size": size,
            "mtime": mtime,
        })
    models.sort(key=lambda m: (m["name"], -m["version"]))
    return models


def train(name: str = "hog_svm") -> dict:
    """Train the classifier on all labeled data and save to disk.

    Args:
        name: model family name (e.g. 'hog_svm')

    Returns training summary dict.
    """
    print("Loading ground truth...")
    gt = load_ground_truth()
    digit_captchas = sum(1 for v in gt.values() if v == "digit")
    puzzle_captchas = sum(1 for v in gt.values() if v != "digit")
    print(f"  {digit_captchas} digit + {puzzle_captchas} puzzle = {len(gt)} captchas")

    print("Extracting tiles & HOG features...")
    X, y, captcha_info = extract_tiles(gt=gt)
    n_digit = int(y.sum())
    n_puzzle = len(y) - n_digit
    print(f"  {len(X)} tiles ({n_digit} digit, {n_puzzle} puzzle), {X.shape[1]} features")

    print("Cross-validating...")
    cv = cross_validate(X, y, captcha_info)
    print(f"  accuracy={cv['accuracy']:.3f}  precision={cv['precision']:.3f}  recall={cv['recall']:.3f}  f1={cv['f1']:.3f}")
    cm = cv["confusion"]
    print(f"  confusion: TN={cm[0][0]} FP={cm[0][1]} FN={cm[1][0]} TP={cm[1][1]}")

    print("Training final model...")
    scaler = StandardScaler()
    clf = LinearSVC(C=0.01, class_weight="balanced", max_iter=5000, random_state=42)
    clf.fit(scaler.fit_transform(X), y)

    path = save_model(scaler, clf, name)
    print(f"Model saved to {path}")
    return {"model_path": path, "name": name, "cv": cv, "tiles": len(X), "features": X.shape[1]}


if __name__ == "__main__":
    train()
