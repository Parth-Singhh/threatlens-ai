"""Exploratory 3-way registered-domain-separated threshold analysis.

Trains a TEMPORARY model using the project's v3 features. It does not save or
promote any model. A validation fold chooses an operating threshold subject to
FPR <= 5%; a separate held-out test fold evaluates that threshold once.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, precision_score, recall_score, f1_score
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from ucimlrepo import fetch_ucirepo

from app.services.url_features import extract_url_features, normalize_url, registered_domain_key

MAX_SAMPLES = 60_000
RANDOM_STATE = 42
FPR_BUDGET = 0.05
THRESHOLDS = [round(x, 2) for x in np.arange(0.05, 0.951, 0.05)]


def metrics_at_threshold(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, float]:
    predicted = (scores >= threshold).astype(int)
    matrix = confusion_matrix(y_true, predicted, labels=[0, 1])
    tn, fp = matrix[0]
    fn, tp = matrix[1]
    return {
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y_true, predicted)),
        "precision_phishing": float(precision_score(y_true, predicted, pos_label=1, zero_division=0)),
        "recall_phishing": float(recall_score(y_true, predicted, pos_label=1, zero_division=0)),
        "f1_phishing": float(f1_score(y_true, predicted, pos_label=1, zero_division=0)),
        "fpr_legitimate": float(fp / max(tn + fp, 1)),
        "fnr_phishing": float(fn / max(fn + tp, 1)),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def main() -> None:
    print("Fetching UCI PhiUSIIL dataset and reproducing v3 cleaning/sampling...")
    dataset = fetch_ucirepo(id=967)
    raw_features, raw_targets = dataset.data.features, dataset.data.targets
    url_column = next((name for name in raw_features.columns if name.lower() == "url"), None)
    if url_column is None or raw_targets.shape[1] < 1:
        raise RuntimeError("Dataset URL or target column is missing.")

    raw = pd.DataFrame({
        "raw_url": raw_features[url_column].astype("string").fillna("").str.strip(),
        "source_label": pd.to_numeric(raw_targets.iloc[:, 0], errors="coerce"),
    })
    raw = raw[(raw.raw_url.str.len() > 0) & raw.source_label.isin([0, 1])].copy()
    raw["label"] = (raw.source_label == 0).astype("int8")  # internal: 1=phishing

    normalized: list[str | None] = []
    invalid = 0
    for value in raw.raw_url.tolist():
        try:
            normalized.append(normalize_url(str(value)))
        except ValueError:
            normalized.append(None)
            invalid += 1
    raw["url"] = normalized
    raw = raw[raw.url.notna()].copy()
    nunique_labels = raw.groupby("url")["label"].nunique()
    conflicting = set(nunique_labels[nunique_labels > 1].index)
    if conflicting:
        raw = raw[~raw.url.isin(conflicting)].copy()
    frame = raw[["url", "label"]].drop_duplicates("url").reset_index(drop=True)
    if frame.label.nunique() != 2 or len(frame) < 1000:
        raise RuntimeError(f"Unexpected cleaned dataset shape: {frame.shape}")
    print(f"Clean URLs: {len(frame):,}; invalid excluded: {invalid:,}; conflicting normalized URL groups excluded: {len(conflicting):,}")

    if len(frame) > MAX_SAMPLES:
        frame, _ = train_test_split(frame, train_size=MAX_SAMPLES, random_state=RANDOM_STATE, stratify=frame.label)
        frame = frame.reset_index(drop=True)
    print(f"Evaluation sample: {len(frame):,} rows; phishing share: {frame.label.mean():.1%}")

    print("Extracting 28 canonical features and registered-domain groups...")
    X = np.asarray([extract_url_features(str(url)) for url in frame.url], dtype=np.float64)
    y = frame.label.to_numpy(dtype=np.int64)
    groups = np.asarray([registered_domain_key(str(url)) for url in frame.url], dtype=object)

    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    folds = [test for _, test in splitter.split(X, y, groups=groups)]
    test_idx = folds[0]
    validation_idx = folds[1]
    train_idx = np.setdiff1d(np.arange(len(frame)), np.concatenate([test_idx, validation_idx]))

    group_sets = [{groups[i] for i in idx} for idx in [train_idx, validation_idx, test_idx]]
    assert not (group_sets[0] & group_sets[1] or group_sets[0] & group_sets[2] or group_sets[1] & group_sets[2]), "Registered-domain leakage detected"
    print(f"Train: {len(train_idx):,} rows/{len(group_sets[0]):,} registered domains")
    print(f"Validation: {len(validation_idx):,} rows/{len(group_sets[1]):,} registered domains")
    print(f"Test: {len(test_idx):,} rows/{len(group_sets[2]):,} registered domains")
    print("Shared domains across all splits: 0")

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("mlp", MLPClassifier(
            hidden_layer_sizes=(64, 32), activation="relu", solver="adam",
            alpha=0.001, batch_size=256, learning_rate_init=0.001,
            max_iter=80, early_stopping=True, validation_fraction=0.1,
            n_iter_no_change=6, random_state=RANDOM_STATE, verbose=False,
        )),
    ])
    print("Training a temporary 60% split model (no files are saved)...")
    model.fit(X[train_idx], y[train_idx])
    positive_index = list(model.classes_).index(1)
    validation_scores = model.predict_proba(X[validation_idx])[:, positive_index]
    test_scores = model.predict_proba(X[test_idx])[:, positive_index]

    print("\nValidation threshold sweep (used for selection only):")
    candidates = []
    for threshold in THRESHOLDS:
        m = metrics_at_threshold(y[validation_idx], validation_scores, threshold)
        print(f"t={threshold:.2f} FPR={m['fpr_legitimate']:.4f} FNR={m['fnr_phishing']:.4f} precision={m['precision_phishing']:.4f} recall={m['recall_phishing']:.4f}")
        if m["fpr_legitimate"] <= FPR_BUDGET:
            candidates.append(m)

    if not candidates:
        raise RuntimeError("No grid threshold met the validation FPR budget; cannot select an operating point.")
    selected = min(candidates, key=lambda m: (m["fnr_phishing"], m["threshold"]))
    selected_threshold = selected["threshold"]

    print(f"\nSelected threshold from validation only: {selected_threshold:.2f} (validation FPR budget <= {FPR_BUDGET:.0%})")
    print("\nUntouched held-out test comparison:")
    for threshold in [0.50, selected_threshold]:
        m = metrics_at_threshold(y[test_idx], test_scores, threshold)
        print(f"\nThreshold {threshold:.2f}")
        for key in ["accuracy", "precision_phishing", "recall_phishing", "f1_phishing", "fpr_legitimate", "fnr_phishing", "tn", "fp", "fn", "tp"]:
            print(f"  {key}: {m[key]:.4f}" if isinstance(m[key], float) else f"  {key}: {m[key]}")
        print(f"  confusion_matrix [[TN,FP],[FN,TP]]: [[{m['tn']},{m['fp']}],[{m['fn']},{m['tp']}]]")

    print("\nThis is a threshold-selection diagnostic, not a promoted model. No artifacts were saved or changed.")
    print("If FNR remains high under the FPR budget, changing the threshold alone cannot meet both goals; improve data/features or add reliable independent evidence.")


if __name__ == "__main__":
    main()
