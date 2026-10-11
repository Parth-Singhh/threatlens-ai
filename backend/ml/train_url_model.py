"""Train and evaluate the first ThreatLens AI neural network: a URL MLP.

Dataset: UCI PhiUSIIL Phishing URL (Website) Dataset, id=967.
The official labels are 1=legitimate and 0=phishing. This script maps them to
0=legitimate and 1=phishing so the positive-class probability is explicit.
Only raw URL strings are used as input; the other published feature columns
are intentionally excluded to ensure inference works from a URL alone.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from ucimlrepo import fetch_ucirepo

from app.services.url_features import URL_FEATURE_NAMES, extract_url_features

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "url_mlp.joblib"
METRICS_PATH = MODEL_DIR / "url_mlp_metrics.json"
DATASET_URL = "https://doi.org/10.1016/j.cose.2023.103545"
MAX_SAMPLES = 60000  # Cap training time on typical student hardware.
RANDOM_STATE = 42


def main() -> None:
    print("[1/6] Fetching the UCI PhiUSIIL phishing URL dataset (id=967)...")
    dataset = fetch_ucirepo(id=967)
    raw_features = dataset.data.features
    raw_targets = dataset.data.targets
    url_column = next((name for name in raw_features.columns if name.lower() == "url"), None)
    if url_column is None:
        raise RuntimeError(
            "Could not find the raw URL column in the UCI dataset. "
            f"Available columns: {list(raw_features.columns)}"
        )
    if raw_targets.shape[1] < 1:
        raise RuntimeError("The UCI dataset did not contain a target column.")

    urls = raw_features[url_column].astype("string").fillna("").str.strip()
    source_labels = pd.to_numeric(raw_targets.iloc[:, 0], errors="coerce")
    frame = pd.DataFrame({"url": urls, "source_label": source_labels})
    frame = frame[(frame["url"].str.len() > 0) & frame["source_label"].isin([0, 1])].copy()
    # UCI PhiUSIIL: source Label 0=phishing, 1=legitimate.
    frame["label"] = (frame["source_label"] == 0).astype("int8")
    frame = frame[["url", "label"]].drop_duplicates(subset=["url"]).reset_index(drop=True)

    usable_unique_url_count = int(len(frame))
    if frame["label"].nunique() != 2 or len(frame) < 1000:
        raise RuntimeError(f"Unexpected dataset shape or labels: {frame.shape}")
    print(f"      Usable unique URLs: {len(frame):,}; phishing share: {frame['label'].mean():.1%}")

    if len(frame) > MAX_SAMPLES:
        print(f"[2/6] Sampling {MAX_SAMPLES:,} URLs with class proportions preserved...")
        frame, _ = train_test_split(
            frame,
            train_size=MAX_SAMPLES,
            random_state=RANDOM_STATE,
            stratify=frame["label"],
        )
        frame = frame.reset_index(drop=True)
    else:
        print("[2/6] Dataset is below the sample cap; using all usable URLs...")

    print("[3/6] Extracting URL-only lexical features (no URLs are opened)...")
    X = np.asarray([extract_url_features(value) for value in frame["url"].tolist()], dtype=np.float64)
    y = frame["label"].to_numpy(dtype=np.int64)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=RANDOM_STATE, stratify=y
    )

    print(f"[4/6] Training MLP on {len(X_train):,} rows; holding out {len(X_test):,} for final testing...")
    pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "mlp",
                MLPClassifier(
                    hidden_layer_sizes=(64, 32),
                    activation="relu",
                    solver="adam",
                    alpha=0.001,
                    batch_size=256,
                    learning_rate_init=0.001,
                    max_iter=80,
                    early_stopping=True,
                    validation_fraction=0.1,
                    n_iter_no_change=6,
                    random_state=RANDOM_STATE,
                    verbose=True,
                ),
            ),
        ]
    )
    pipeline.fit(X_train, y_train)

    print("[5/6] Evaluating on the held-out test split...")
    y_pred = pipeline.predict(X_test)
    y_probability = pipeline.predict_proba(X_test)[:, list(pipeline.classes_).index(1)]
    report = classification_report(
        y_test,
        y_pred,
        labels=[0, 1],
        target_names=["legitimate", "phishing"],
        output_dict=True,
        zero_division=0,
    )
    matrix = confusion_matrix(y_test, y_pred, labels=[0, 1]).tolist()
    metrics = {
        "model_name": "ThreatLens URL MLP v1",
        "dataset": "UCI PhiUSIIL Phishing URL (Website) Dataset",
        "dataset_id": 967,
        "dataset_url": DATASET_URL,
        "citation": "Prasad, A. & Chandra, S. (2024). PhiUSIIL Phishing URL (Website) Dataset. UCI Machine Learning Repository.",
        "label_mapping": {"0": "legitimate", "1": "phishing"},
        "training_source_label_mapping": {"1": "legitimate (mapped to 0)", "0": "phishing (mapped to 1)"},
        "feature_names": list(URL_FEATURE_NAMES),
        "feature_count": len(URL_FEATURE_NAMES),
        "usable_unique_urls_before_sampling": usable_unique_url_count,
        "sample_count": int(len(frame)),
        "train_count": int(len(X_train)),
        "test_count": int(len(X_test)),
        "random_state": RANDOM_STATE,
        "architecture": {"type": "MLPClassifier", "hidden_layers": [64, 32], "activation": "relu", "optimizer": "adam", "regularization_alpha": 0.001, "early_stopping": True},
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision_phishing": float(precision_score(y_test, y_pred, pos_label=1, zero_division=0)),
        "recall_phishing": float(recall_score(y_test, y_pred, pos_label=1, zero_division=0)),
        "f1_phishing": float(f1_score(y_test, y_pred, pos_label=1, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, y_probability)),
        "confusion_matrix_labels_order": ["legitimate", "phishing"],
        "confusion_matrix": matrix,
        "classification_report": report,
        "training_iterations": int(pipeline.named_steps["mlp"].n_iter_),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "warning": "Research/demo aid only. Dataset and lexical features do not establish real-world safety. Validate on additional contemporary data before operational use.",
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print("[6/6] Saved model and metrics.")
    print(f"Model:   {MODEL_PATH}")
    print(f"Metrics: {METRICS_PATH}")
    print("\nHeld-out test results:")
    print(json.dumps({key: metrics[key] for key in ("accuracy", "precision_phishing", "recall_phishing", "f1_phishing", "roc_auc", "training_iterations")}, indent=2))
    print("\nConfusion matrix (rows=actual [legitimate, phishing], columns=predicted [legitimate, phishing]):")
    print(np.asarray(matrix))
    print("\nDo not claim these metrics until this script completes successfully.")


if __name__ == "__main__":
    main()
