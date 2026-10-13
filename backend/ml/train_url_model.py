"""Train a candidate URL MLP using canonical URL features and domain-separated evaluation.

Source labels from the UCI PhiUSIIL dataset: 1=legitimate, 0=phishing. The
model target is mapped to 0=legitimate, 1=phishing. Only URL strings are used;
URLs are never fetched. Training writes a candidate artifact and never replaces
an installed model automatically.
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
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from ucimlrepo import fetch_ucirepo

from app.services.url_features import (
    NORMALIZATION_VERSION,
    URL_FEATURE_NAMES,
    extract_url_features,
    normalize_url,
    registered_domain_key,
)

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "url_mlp_candidate.joblib"
METRICS_PATH = MODEL_DIR / "url_mlp_candidate_metrics.json"
DATASET_URL = "https://doi.org/10.1016/j.cose.2023.103545"
MAX_SAMPLES = 60000
RANDOM_STATE = 42


def main() -> None:
    print("[1/7] Fetching UCI PhiUSIIL phishing URL dataset (id=967)...")
    dataset = fetch_ucirepo(id=967)
    raw_features = dataset.data.features
    raw_targets = dataset.data.targets
    url_column = next((name for name in raw_features.columns if name.lower() == "url"), None)
    if url_column is None:
        raise RuntimeError(f"Could not find raw URL column. Available: {list(raw_features.columns)}")
    if raw_targets.shape[1] < 1:
        raise RuntimeError("The dataset did not contain a target column.")

    urls = raw_features[url_column].astype("string").fillna("").str.strip()
    source_labels = pd.to_numeric(raw_targets.iloc[:, 0], errors="coerce")
    raw = pd.DataFrame({"raw_url": urls, "source_label": source_labels})
    raw = raw[(raw["raw_url"].str.len() > 0) & raw["source_label"].isin([0, 1])].copy()
    # Dataset label 0=phishing and 1=legitimate; internal target 1=phishing.
    raw["label"] = (raw["source_label"] == 0).astype("int8")

    print("[2/7] Normalizing URLs and checking duplicate/contradictory labels...")
    normalized_urls: list[str | None] = []
    invalid_count = 0
    for value in raw["raw_url"].tolist():
        try:
            normalized_urls.append(normalize_url(str(value)))
        except ValueError:
            normalized_urls.append(None)
            invalid_count += 1
    raw["url"] = normalized_urls
    raw = raw[raw["url"].notna()].copy()

    label_counts = raw.groupby("url", dropna=False)["label"].nunique()
    conflicting_urls = set(label_counts[label_counts > 1].index.tolist())
    conflicting_rows = int(raw["url"].isin(conflicting_urls).sum())
    if conflicting_urls:
        print(
            f"      Excluding {len(conflicting_urls):,} normalized URLs ({conflicting_rows:,} rows) "
            "whose labels conflict after canonicalization; no labels were silently changed."
        )
        raw = raw[~raw["url"].isin(conflicting_urls)].copy()

    before_dedupe = len(raw)
    frame = raw[["url", "label"]].drop_duplicates(subset=["url"]).reset_index(drop=True)
    same_label_duplicates_removed = before_dedupe - len(frame)
    if frame["label"].nunique() != 2 or len(frame) < 1000:
        raise RuntimeError(f"Unexpected dataset shape or labels after normalization: {frame.shape}")

    usable_unique_url_count = int(len(frame))
    print(f"      Invalid URLs excluded: {invalid_count:,}")
    print(f"      Same-label normalized duplicates removed: {same_label_duplicates_removed:,}")
    print(f"      Usable unique normalized URLs: {len(frame):,}; phishing share: {frame['label'].mean():.1%}")

    if len(frame) > MAX_SAMPLES:
        print(f"[3/7] Sampling {MAX_SAMPLES:,} URLs with class proportions preserved...")
        frame, _ = train_test_split(
            frame, train_size=MAX_SAMPLES, random_state=RANDOM_STATE,
            stratify=frame["label"],
        )
        frame = frame.reset_index(drop=True)
    else:
        print("[3/7] Using all cleaned URLs below the sample cap...")

    print("[4/7] Extracting canonical URL-only lexical features (no URLs are opened)...")
    X = np.asarray([extract_url_features(url) for url in frame["url"].tolist()], dtype=np.float64)
    y = frame["label"].to_numpy(dtype=np.int64)
    groups = np.asarray([registered_domain_key(url) for url in frame["url"].tolist()], dtype=object)

    # Use a registered-domain-aware split rather than randomly distributing URLs
    # from the same site across train/test. Stratification keeps both classes in
    # the held-out fold while the Public Suffix List defines domain boundaries.
    print("[5/7] Creating registered-domain-separated train/test split...")
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    train_idx, test_idx = next(splitter.split(X, y, groups=groups))
    train_groups = set(groups[train_idx])
    test_groups = set(groups[test_idx])
    shared_groups = train_groups & test_groups
    if shared_groups:
        raise RuntimeError(f"Domain leakage detected: {len(shared_groups)} groups overlap train/test.")
    if len(np.unique(y[train_idx])) < 2 or len(np.unique(y[test_idx])) < 2:
        raise RuntimeError("Domain-separated split did not preserve both classes.")

    print(f"      Training rows/domains: {len(train_idx):,}/{len(train_groups):,}")
    print(f"      Test rows/domains: {len(test_idx):,}/{len(test_groups):,}")
    print(f"      Shared registered domains: {len(shared_groups)}")
    print(f"      Phishing share train/test: {y[train_idx].mean():.1%}/{y[test_idx].mean():.1%}")

    print("[6/7] Training MLP candidate...")
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
    pipeline.fit(X[train_idx], y[train_idx])

    print("[7/7] Evaluating on the held-out registered-domain split...")
    y_pred = pipeline.predict(X[test_idx])
    class_labels = list(pipeline.classes_)
    if class_labels != [0, 1]:
        raise RuntimeError(f"Unexpected learned class order {class_labels!r}; expected [0, 1].")
    y_probability = pipeline.predict_proba(X[test_idx])[:, class_labels.index(1)]
    report = classification_report(
        y[test_idx], y_pred, labels=[0, 1],
        target_names=["legitimate", "phishing"], output_dict=True, zero_division=0,
    )
    matrix = confusion_matrix(y[test_idx], y_pred, labels=[0, 1]).tolist()
    legitimate_tn, legitimate_fp = matrix[0]
    phishing_fn, phishing_tp = matrix[1]
    fpr = legitimate_fp / max(legitimate_tn + legitimate_fp, 1)
    fnr = phishing_fn / max(phishing_fn + phishing_tp, 1)

    pipeline.threatlens_model_name_ = "ThreatLens URL MLP v3"
    pipeline.threatlens_feature_names_ = list(URL_FEATURE_NAMES)
    pipeline.threatlens_normalization_version_ = NORMALIZATION_VERSION

    metrics = {
        "model_name": "ThreatLens URL MLP v3 candidate",
        "dataset": "UCI PhiUSIIL Phishing URL (Website) Dataset",
        "dataset_id": 967,
        "dataset_url": DATASET_URL,
        "citation": "Prasad, A. & Chandra, S. (2024). PhiUSIIL Phishing URL (Website) Dataset. UCI Machine Learning Repository.",
        "source_label_mapping": {"1": "legitimate", "0": "phishing"},
        "internal_label_mapping": {"0": "legitimate", "1": "phishing"},
        "feature_names": list(URL_FEATURE_NAMES),
        "feature_count": len(URL_FEATURE_NAMES),
        "normalization_version": NORMALIZATION_VERSION,
        "invalid_urls_excluded": invalid_count,
        "conflicting_normalized_url_groups_excluded": len(conflicting_urls),
        "rows_in_conflicting_normalized_url_groups_excluded": conflicting_rows,
        "same_label_normalized_duplicates_removed": same_label_duplicates_removed,
        "usable_unique_urls_before_sampling": usable_unique_url_count,
        "sample_count": int(len(frame)),
        "train_count": int(len(train_idx)),
        "test_count": int(len(test_idx)),
        "train_registered_domain_count": len(train_groups),
        "test_registered_domain_count": len(test_groups),
        "shared_registered_domain_count": len(shared_groups),
        "split_strategy": "StratifiedGroupKFold by PSL-aware registered domain; first held-out fold",
        "random_state": RANDOM_STATE,
        "architecture": {"type": "MLPClassifier", "hidden_layers": [64, 32], "activation": "relu", "optimizer": "adam", "regularization_alpha": 0.001, "early_stopping": True},
        "accuracy": float(accuracy_score(y[test_idx], y_pred)),
        "precision_phishing": float(precision_score(y[test_idx], y_pred, pos_label=1, zero_division=0)),
        "recall_phishing": float(recall_score(y[test_idx], y_pred, pos_label=1, zero_division=0)),
        "f1_phishing": float(f1_score(y[test_idx], y_pred, pos_label=1, zero_division=0)),
        "roc_auc": float(roc_auc_score(y[test_idx], y_probability)),
        "false_positive_rate_legitimate": float(fpr),
        "false_negative_rate_phishing": float(fnr),
        "confusion_matrix_labels_order": ["legitimate", "phishing"],
        "confusion_matrix": matrix,
        "classification_report": report,
        "training_iterations": int(pipeline.named_steps["mlp"].n_iter_),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "warning": "Research/demo aid only. Domain-separated source-dataset metrics do not establish real-world performance; independent contemporary labeled data is still required.",
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print("Saved candidate model:", MODEL_PATH)
    print("Saved candidate metrics:", METRICS_PATH)
    print("\nCandidate test metrics:")
    print(json.dumps({key: metrics[key] for key in (
        "accuracy", "precision_phishing", "recall_phishing", "f1_phishing",
        "roc_auc", "false_positive_rate_legitimate", "false_negative_rate_phishing",
        "training_iterations", "shared_registered_domain_count",
    )}, indent=2))
    print("\nConfusion matrix (rows=true [legitimate, phishing], columns=predicted [legitimate, phishing]):")
    print(np.asarray(matrix))
    print("\nCandidate saved separately. Production model was not overwritten.")


if __name__ == "__main__":
    main()
