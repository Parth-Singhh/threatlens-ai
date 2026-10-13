"""Exploratory, registered-domain-separated feature ablation for ThreatLens v3.

Compares the full v3 schema with (a) no path/query-related features and
(b) hostname-only lexical features. A validation partition selects the feature
set and threshold under an explicit FPR budget. The untouched test partition
is used only to evaluate the selected configuration. Temporary models only;
no model files are saved, changed, or promoted.

The test result is still exploratory because multiple feature families are
being considered; use a later, independent dataset for final claims.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, confusion_matrix, f1_score, precision_score,
    recall_score, roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from ucimlrepo import fetch_ucirepo

from app.services.url_features import (
    URL_FEATURE_NAMES, extract_url_features, normalize_url, registered_domain_key,
)

MAX_SAMPLES = 60_000
RANDOM_STATE = 42
FPR_BUDGET = 0.05
THRESHOLDS = np.round(np.arange(0.05, 0.951, 0.01), 2)

HOST_FEATURES = {
    "host_length", "host_dot_count", "subdomain_count", "host_hyphen_count",
    "host_is_ip", "has_port", "host_uses_punycode", "is_shortener",
    "tld_length", "host_double_hyphen", "host_character_entropy",
}
PATH_QUERY_RELATED_FEATURES = {
    "path_length", "query_length", "url_length", "url_hyphen_count",
    "underscore_count", "at_symbol_count", "question_mark_count",
    "equals_count", "ampersand_count", "percent_count", "digit_count",
    "alphabetic_count", "digit_ratio", "special_character_ratio",
    "suspicious_term_count", "path_depth", "query_parameter_count",
}


def build_model() -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("mlp", MLPClassifier(
            hidden_layer_sizes=(64, 32), activation="relu", solver="adam",
            alpha=0.001, batch_size=256, learning_rate_init=0.001,
            max_iter=80, early_stopping=True, validation_fraction=0.1,
            n_iter_no_change=6, random_state=RANDOM_STATE, verbose=False,
        )),
    ])


def calc_metrics(y: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, float | int]:
    pred = (scores >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y, pred)),
        "precision_phishing": float(precision_score(y, pred, zero_division=0)),
        "recall_phishing": float(recall_score(y, pred, zero_division=0)),
        "f1_phishing": float(f1_score(y, pred, zero_division=0)),
        "fpr_legitimate": float(fp / max(tn + fp, 1)),
        "fnr_phishing": float(fn / max(fn + tp, 1)),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def best_threshold(y: np.ndarray, scores: np.ndarray) -> dict[str, float | int]:
    options = [calc_metrics(y, scores, float(t)) for t in THRESHOLDS]
    feasible = [m for m in options if float(m["fpr_legitimate"]) <= FPR_BUDGET]
    if not feasible:
        raise RuntimeError(f"No validation threshold met FPR <= {FPR_BUDGET:.0%}.")
    # Favor best phishing recall at the constraint; then the lower threshold.
    return max(feasible, key=lambda m: (float(m["recall_phishing"]), -float(m["threshold"])))


def show_metrics(title: str, m: dict[str, float | int]) -> None:
    print(f"\n{title} (threshold={float(m['threshold']):.2f})")
    for key in ["accuracy", "precision_phishing", "recall_phishing", "f1_phishing", "fpr_legitimate", "fnr_phishing"]:
        print(f"  {key}: {float(m[key]):.4f}")
    print(f"  confusion_matrix [[TN,FP],[FN,TP]]: [[{m['tn']},{m['fp']}],[{m['fn']},{m['tp']}]]")


def main() -> None:
    print("Loading UCI PhiUSIIL and reproducing v3 cleaning/sampling...")
    data = fetch_ucirepo(id=967)
    features, targets = data.data.features, data.data.targets
    url_col = next((c for c in features.columns if c.lower() == "url"), None)
    if url_col is None or targets.shape[1] < 1:
        raise RuntimeError("Dataset URL column or target column is missing.")

    raw = pd.DataFrame({
        "raw_url": features[url_col].astype("string").fillna("").str.strip(),
        "source_label": pd.to_numeric(targets.iloc[:, 0], errors="coerce"),
    })
    raw = raw[(raw.raw_url.str.len() > 0) & raw.source_label.isin([0, 1])].copy()
    raw["label"] = (raw.source_label == 0).astype("int8")  # target 1=phishing
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
    label_counts = raw.groupby("url")["label"].nunique()
    conflicting = set(label_counts[label_counts > 1].index)
    if conflicting:
        raw = raw[~raw.url.isin(conflicting)].copy()
    frame = raw[["url", "label"]].drop_duplicates("url").reset_index(drop=True)
    if frame.label.nunique() != 2 or len(frame) < 1000:
        raise RuntimeError(f"Unexpected cleaned dataset shape: {frame.shape}")
    print(f"clean_urls={len(frame):,}; invalid_excluded={invalid:,}; conflicting_url_groups={len(conflicting):,}")

    if len(frame) > MAX_SAMPLES:
        frame, _ = train_test_split(
            frame, train_size=MAX_SAMPLES, random_state=RANDOM_STATE,
            stratify=frame.label,
        )
        frame = frame.reset_index(drop=True)
    print(f"sample_rows={len(frame):,}; phishing_share={frame.label.mean():.1%}")

    X = np.asarray([extract_url_features(str(u)) for u in frame.url], dtype=np.float64)
    y = frame.label.to_numpy(dtype=np.int64)
    groups = np.asarray([registered_domain_key(str(u)) for u in frame.url], dtype=object)
    if X.shape[1] != len(URL_FEATURE_NAMES):
        raise RuntimeError("Feature matrix/schema mismatch.")

    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    folds = [test for _, test in splitter.split(X, y, groups=groups)]
    test_idx, val_idx = folds[0], folds[1]
    train_idx = np.setdiff1d(np.arange(len(frame)), np.concatenate([test_idx, val_idx]))
    groups_by_split = [{groups[i] for i in idx} for idx in (train_idx, val_idx, test_idx)]
    if any(groups_by_split[i] & groups_by_split[j] for i in range(3) for j in range(i + 1, 3)):
        raise RuntimeError("Registered-domain leakage across train/validation/test splits.")
    print(f"train={len(train_idx):,}/{len(groups_by_split[0]):,} domains; validation={len(val_idx):,}/{len(groups_by_split[1]):,} domains; test={len(test_idx):,}/{len(groups_by_split[2]):,} domains; overlap=0")

    all_names = list(URL_FEATURE_NAMES)
    ablations = [
        ("v3_full", all_names),
        ("v3_without_path_query_related", [n for n in all_names if n not in PATH_QUERY_RELATED_FEATURES]),
        ("v3_hostname_only", [n for n in all_names if n in HOST_FEATURES]),
    ]
    trained: dict[str, tuple[Pipeline, np.ndarray, list[int], dict[str, float | int]]] = {}

    print(f"\nVALIDATION-ONLY FEATURE/TRESHOLD SELECTION (FPR budget <= {FPR_BUDGET:.0%})")
    for name, names in ablations:
        idx = [URL_FEATURE_NAMES.index(n) for n in names]
        model = build_model()
        print(f"Training {name} ({len(names)} features)...")
        model.fit(X[train_idx][:, idx], y[train_idx])
        if list(model.classes_) != [0, 1]:
            raise RuntimeError(f"Unexpected class order: {model.classes_}")
        val_scores = model.predict_proba(X[val_idx][:, idx])[:, 1]
        chosen = best_threshold(y[val_idx], val_scores)
        show_metrics(f"Validation: {name}", chosen)
        trained[name] = (model, val_scores, idx, chosen)

    selected_name = max(
        trained,
        key=lambda name: (
            float(trained[name][3]["recall_phishing"]),
            float(trained[name][3]["precision_phishing"]),
        ),
    )
    selected_model, _, selected_idx, selected_val_metrics = trained[selected_name]
    print(f"\nSelected using validation only: {selected_name}")
    print(f"Selected validation threshold: {float(selected_val_metrics['threshold']):.2f}")

    test_scores = selected_model.predict_proba(X[test_idx][:, selected_idx])[:, 1]
    show_metrics("UNTOUCHED TEST: fixed 0.50 threshold", calc_metrics(y[test_idx], test_scores, 0.50))
    show_metrics("UNTOUCHED TEST: validation-selected threshold", calc_metrics(y[test_idx], test_scores, float(selected_val_metrics["threshold"])))

    print("\nStructural sanity examples (outputs are model scores, NOT verified URL verdicts):")
    sample_urls = [
        "https://www.google.com/",
        "https://www.wikipedia.org/",
        "https://example.com/",
        "https://www.google.com/search?q=example",
        "https://en.wikipedia.org/wiki/URL",
        "https://www.python.org/downloads/",
        "https://google.com.example.org/",
        "https://google.com@evil.example/",
    ]
    for url in sample_urls:
        feature_row = np.asarray(extract_url_features(url), dtype=np.float64)[selected_idx].reshape(1, -1)
        score = float(selected_model.predict_proba(feature_row)[0, 1])
        print(f"p_phishing={score:.4f}  {url}")

    print("\nAblation completed. No artifacts were saved, replaced, or promoted.")
    print("Use this as exploratory evidence only; independent current labeled evaluation is still required.")


if __name__ == "__main__":
    main()
