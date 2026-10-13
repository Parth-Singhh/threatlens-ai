"""Train a new ThreatLens URL MLP candidate on mixed-source raw URL data.

Sources:
- UCI PhiUSIIL (id=967): original label 1=legitimate, 0=phishing.
- Hugging Face flwrlabs/fed-phishing-urls: label 0=benign, 1=phishing.

Both sources are mapped to internal label 0=legitimate, 1=phishing. Only URL
strings and labels are read; supplied URLs are NEVER visited. Rows with
conflicting labels after the model's own scheme/www-neutral canonicalization
are excluded rather than silently relabelled. All train/validation/test splits
are grouped by Public Suffix List-aware registered domain.

A candidate is saved separately. This script never replaces the production
artifact and does not claim that inherited public-dataset labels are perfect.
"""
from __future__ import annotations

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
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
    canonical_model_url_key,
    extract_url_features,
    normalize_url,
    registered_domain_key,
)

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "url_mlp_v4_candidate.joblib"
METRICS_PATH = MODEL_DIR / "url_mlp_v4_candidate_metrics.json"
HF_REPO = "flwrlabs/fed-phishing-urls"
HF_API = "https://huggingface.co/api/datasets/flwrlabs/fed-phishing-urls/tree/main?recursive=true&expand=false"
MAX_UCI_SAMPLES = 60_000
MAX_HF_PER_CLASS = 50_000
RANDOM_STATE = 42
FPR_BUDGET = 0.05
THRESHOLDS = np.round(np.arange(0.05, 0.951, 0.01), 2)


def _read_json_url(url: str) -> Any:
    request = Request(url, headers={"User-Agent": "ThreatLens-AI-research/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def download_hf_url_rows(temp_dir: Path) -> pd.DataFrame:
    """Download only URL/label columns from the small public parquet corpus."""
    print(f"Fetching dataset file manifest for {HF_REPO}...")
    try:
        items = _read_json_url(HF_API)
        if not isinstance(items, list):
            raise RuntimeError("Unexpected dataset manifest response shape.")
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, RuntimeError) as exc:
        raise RuntimeError(
            "Could not retrieve the Hugging Face dataset file manifest. "
            "Check container internet access; no model files have been changed."
        ) from exc

    parquet_paths = sorted(
        item["path"] for item in items
        if item.get("type") == "file" and str(item.get("path", "")).lower().endswith(".parquet")
    )
    if not parquet_paths:
        raise RuntimeError("The Hugging Face manifest contained no parquet files; no model files have been changed.")

    tables: list[pd.DataFrame] = []
    for number, relative_path in enumerate(parquet_paths, start=1):
        destination = temp_dir / f"hf_urls_{number}.parquet"
        url = f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/{quote(relative_path, safe='/')}"
        print(f"[{number}/{len(parquet_paths)}] Downloading dataset shard: {relative_path}")
        request = Request(url, headers={"User-Agent": "ThreatLens-AI-research/1.0"})
        try:
            with urlopen(request, timeout=180) as response, destination.open("wb") as output:
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    output.write(block)
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise RuntimeError(
                f"Could not download dataset shard {relative_path!r}. "
                "No production/candidate model was changed."
            ) from exc
        try:
            # pyarrow is added as a training-time data reader; only two columns
            # are materialized, and the HTML of web pages is not part of this dataset.
            part = pd.read_parquet(destination, columns=["url", "label"])
        except Exception as exc:
            raise RuntimeError(
                "Could not read downloaded parquet. Confirm pyarrow installed after rebuilding the backend."
            ) from exc
        tables.append(part)

    frame = pd.concat(tables, ignore_index=True)
    frame["url"] = frame["url"].astype("string").fillna("").str.strip()
    frame["label"] = pd.to_numeric(frame["label"], errors="coerce")
    frame = frame[(frame["url"].str.len() > 0) & frame["label"].isin([0, 1])].copy()
    # HF card: 0=benign/legitimate; 1=phishing/malicious.
    frame["label"] = frame["label"].astype("int8")
    frame["source"] = "HuggingFace"
    if frame["label"].nunique() != 2:
        raise RuntimeError("The supplemental dataset does not contain both expected labels.")
    print(f"Supplemental rows read: {len(frame):,}; phishing share: {frame['label'].mean():.1%}")
    return frame[["url", "label", "source"]]


def load_uci_rows() -> pd.DataFrame:
    print("Fetching UCI PhiUSIIL dataset (id=967)...")
    dataset = fetch_ucirepo(id=967)
    raw_features, raw_targets = dataset.data.features, dataset.data.targets
    url_column = next((name for name in raw_features.columns if name.lower() == "url"), None)
    if url_column is None or raw_targets.shape[1] < 1:
        raise RuntimeError("UCI dataset is missing its raw URL or target column.")
    urls = raw_features[url_column].astype("string").fillna("").str.strip()
    source_labels = pd.to_numeric(raw_targets.iloc[:, 0], errors="coerce")
    frame = pd.DataFrame({"url": urls, "source_label": source_labels})
    frame = frame[(frame["url"].str.len() > 0) & frame["source_label"].isin([0, 1])].copy()
    # UCI PhiUSIIL: source 0=phishing, 1=legitimate; internal 0=legitimate, 1=phishing.
    frame["label"] = (frame["source_label"] == 0).astype("int8")
    frame = frame[["url", "label"]].drop_duplicates("url").reset_index(drop=True)
    if len(frame) > MAX_UCI_SAMPLES:
        frame, _ = train_test_split(
            frame, train_size=MAX_UCI_SAMPLES, random_state=RANDOM_STATE,
            stratify=frame["label"],
        )
        frame = frame.reset_index(drop=True)
    frame["source"] = "UCI"
    print(f"UCI sample: {len(frame):,} rows; phishing share: {frame['label'].mean():.1%}")
    return frame[["url", "label", "source"]]


def sample_hf_rows(frame: pd.DataFrame) -> pd.DataFrame:
    parts = []
    for label in (0, 1):
        part = frame[frame["label"] == label]
        take = min(MAX_HF_PER_CLASS, len(part))
        if take == 0:
            raise RuntimeError(f"Supplemental source has no examples for label {label}.")
        parts.append(part.sample(n=take, random_state=RANDOM_STATE))
    sampled = pd.concat(parts, ignore_index=True).sample(frac=1, random_state=RANDOM_STATE).reset_index(drop=True)
    print(f"Supplemental stratified sample: {len(sampled):,} rows ({MAX_HF_PER_CLASS:,} max per class)")
    return sampled


def prepare_mixed_frame(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    normalized: list[str | None] = []
    keys: list[str | None] = []
    invalid = 0
    for value in raw["url"].tolist():
        try:
            url = normalize_url(str(value))
            key = canonical_model_url_key(url)
            normalized.append(url)
            keys.append(key)
        except (TypeError, ValueError):
            normalized.append(None)
            keys.append(None)
            invalid += 1
    frame = raw.copy()
    frame["normalized_url"] = normalized
    frame["model_key"] = keys
    frame = frame[frame["model_key"].notna()].copy()

    label_counts = frame.groupby("model_key")["label"].nunique()
    conflicting_keys = set(label_counts[label_counts > 1].index)
    conflicting_rows = int(frame["model_key"].isin(conflicting_keys).sum())
    if conflicting_keys:
        print(
            f"Excluding {len(conflicting_keys):,} canonical URL groups ({conflicting_rows:,} rows) "
            "with conflicting labels across sources; no labels were changed."
        )
        frame = frame[~frame["model_key"].isin(conflicting_keys)].copy()

    # Collapse URLs that produce the same model representation and have the
    # same label. Preserve a compact provenance tag for source-wise evaluation.
    aggregates = frame.groupby("model_key", sort=False).agg(
        url=("normalized_url", "first"),
        label=("label", "first"),
        sources=("source", lambda values: "+".join(sorted(set(values)))),
    ).reset_index()
    aggregates["label"] = aggregates["label"].astype("int8")
    if aggregates["label"].nunique() != 2 or len(aggregates) < 1000:
        raise RuntimeError(f"Unexpected mixed dataset shape after normalization: {aggregates.shape}")

    # Report path coverage from the actual sampled rows, per source and label.
    coverage = {}
    source_rows = frame.copy()
    source_rows["nonroot_path"] = source_rows["normalized_url"].map(
        lambda url: bool(urlsplit(str(url)).path not in ("", "/"))
    )
    for source in sorted(source_rows["source"].unique()):
        for label in (0, 1):
            subset = source_rows[(source_rows["source"] == source) & (source_rows["label"] == label)]
            coverage[f"{source}_label_{label}_nonroot_path_rate"] = (
                float(subset["nonroot_path"].mean()) if len(subset) else None
            )
            print(
                f"Path coverage {source} label={label}: "
                f"{coverage[f'{source}_label_{label}_nonroot_path_rate']:.1%} "
                f"non-root paths ({len(subset):,} rows)" if len(subset) else
                f"Path coverage {source} label={label}: no rows"
            )

    details = {
        "invalid_rows_excluded": invalid,
        "conflicting_canonical_url_groups_excluded": len(conflicting_keys),
        "rows_in_conflicting_groups_excluded": conflicting_rows,
        "duplicate_model_keys_collapsed": len(frame) - len(aggregates),
        "mixed_unique_rows": len(aggregates),
        **coverage,
    }
    return aggregates, details


def build_model() -> Pipeline:
    return Pipeline([
        ("scaler", StandardScaler()),
        ("mlp", MLPClassifier(
            hidden_layer_sizes=(64, 32), activation="relu", solver="adam",
            alpha=0.001, batch_size=256, learning_rate_init=0.001,
            max_iter=80, early_stopping=True, validation_fraction=0.1,
            n_iter_no_change=6, random_state=RANDOM_STATE, verbose=True,
        )),
    ])


def metric_row(y: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, float | int]:
    pred = (scores >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y, pred)),
        "precision_phishing": float(precision_score(y, pred, zero_division=0)),
        "recall_phishing": float(recall_score(y, pred, zero_division=0)),
        "f1_phishing": float(f1_score(y, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y, scores)),
        "false_positive_rate_legitimate": float(fp / max(tn + fp, 1)),
        "false_negative_rate_phishing": float(fn / max(fn + tp, 1)),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def select_threshold(y: np.ndarray, scores: np.ndarray) -> dict[str, float | int] | None:
    options = [metric_row(y, scores, float(t)) for t in THRESHOLDS]
    feasible = [row for row in options if float(row["false_positive_rate_legitimate"]) <= FPR_BUDGET]
    if not feasible:
        return None
    return max(feasible, key=lambda row: (float(row["recall_phishing"]), -float(row["threshold"])))


def main() -> None:
    print("ThreatLens URL MLP v4 mixed-source candidate training")
    print("URL strings only. No submitted or dataset URLs will be visited.")
    print("Sources use explicit mappings: UCI 1=legitimate/0=phishing; HF 0=benign/1=phishing.")
    with tempfile.TemporaryDirectory(prefix="threatlens_hf_urls_") as temp:
        hf_all = download_hf_url_rows(Path(temp))
        hf = sample_hf_rows(hf_all)
    uci = load_uci_rows()
    raw = pd.concat([uci, hf], ignore_index=True)
    print(f"Combined pre-cleaning rows: {len(raw):,}")
    frame, cleaning = prepare_mixed_frame(raw)
    frame["registered_domain"] = frame["url"].map(registered_domain_key)

    print(f"Clean mixed rows: {len(frame):,}; phishing share: {frame['label'].mean():.1%}")
    print("Rows by source-provenance group:")
    print(frame["sources"].value_counts().to_string())

    print("Extracting canonical URL-only features (no URL is opened)...")
    X = np.asarray([extract_url_features(url) for url in frame["url"].tolist()], dtype=np.float64)
    y = frame["label"].to_numpy(dtype=np.int64)
    groups = frame["registered_domain"].to_numpy(dtype=object)
    if X.shape[1] != len(URL_FEATURE_NAMES):
        raise RuntimeError("Feature matrix does not match the active schema; candidate not saved.")

    print("Creating registered-domain-separated train/validation/test partitions...")
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    folds = [test for _, test in splitter.split(X, y, groups=groups)]
    test_idx, val_idx = folds[0], folds[1]
    train_idx = np.setdiff1d(np.arange(len(frame)), np.concatenate([test_idx, val_idx]))
    split_groups = [{groups[i] for i in idx} for idx in (train_idx, val_idx, test_idx)]
    overlap = [
        len(split_groups[i] & split_groups[j])
        for i in range(3) for j in range(i + 1, 3)
    ]
    if any(overlap):
        raise RuntimeError(f"Registered-domain leakage detected across splits: {overlap}")
    if any(np.unique(y[idx]).size != 2 for idx in (train_idx, val_idx, test_idx)):
        raise RuntimeError("A split does not contain both classes; candidate not saved.")

    print(
        f"train={len(train_idx):,}/{len(split_groups[0]):,} domains; "
        f"validation={len(val_idx):,}/{len(split_groups[1]):,} domains; "
        f"test={len(test_idx):,}/{len(split_groups[2]):,} domains; "
        f"registered-domain overlap=0"
    )
    model = build_model()
    print("Training candidate model...")
    model.fit(X[train_idx], y[train_idx])
    if list(model.classes_) != [0, 1]:
        raise RuntimeError(f"Unexpected model class order: {model.classes_!r}; candidate not saved.")

    val_scores = model.predict_proba(X[val_idx])[:, 1]
    selected = select_threshold(y[val_idx], val_scores)
    test_scores = model.predict_proba(X[test_idx])[:, 1]
    test_fixed = metric_row(y[test_idx], test_scores, 0.50)
    test_selected = metric_row(y[test_idx], test_scores, float(selected["threshold"])) if selected else None

    def source_metrics(indices: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, object]:
        subset = frame.iloc[indices]
        output: dict[str, object] = {}
        for source in sorted(subset["sources"].unique()):
            mask = (subset["sources"].to_numpy() == source)
            if mask.sum() == 0 or np.unique(y[indices][mask]).size != 2:
                continue
            output[str(source)] = metric_row(y[indices][mask], scores[mask], threshold)
        return output

    model.threatlens_model_name_ = "ThreatLens URL MLP v4 mixed-source candidate"
    model.threatlens_feature_names_ = list(URL_FEATURE_NAMES)
    model.threatlens_normalization_version_ = NORMALIZATION_VERSION
    model.threatlens_training_sources_ = ["UCI PhiUSIIL (id 967)", "flwrlabs/fed-phishing-urls (Apache-2.0)"]
    metrics: dict[str, object] = {
        "model_name": model.threatlens_model_name_,
        "candidate_only": True,
        "dataset_sources": [
            {"name": "UCI PhiUSIIL", "id": 967, "source_labels": {"1": "legitimate", "0": "phishing"}, "internal_labels": {"0": "legitimate", "1": "phishing"}},
            {"name": HF_REPO, "url": "https://huggingface.co/datasets/flwrlabs/fed-phishing-urls", "license": "Apache-2.0 per dataset card", "source_labels": {"0": "benign/legitimate", "1": "phishing/malicious"}, "caveat": "Inherited public-dataset labels can be noisy or stale; dataset URLs were not visited."},
        ],
        "internal_label_mapping": {"0": "legitimate", "1": "phishing"},
        "feature_names": list(URL_FEATURE_NAMES),
        "feature_count": len(URL_FEATURE_NAMES),
        "normalization_version": NORMALIZATION_VERSION,
        "cleaning": cleaning,
        "row_count": int(len(frame)),
        "phishing_share": float(y.mean()),
        "train_rows": int(len(train_idx)), "validation_rows": int(len(val_idx)), "test_rows": int(len(test_idx)),
        "train_registered_domains": int(len(split_groups[0])),
        "validation_registered_domains": int(len(split_groups[1])),
        "test_registered_domains": int(len(split_groups[2])),
        "registered_domain_overlap_count": int(sum(overlap)),
        "split_strategy": "StratifiedGroupKFold; distinct PSL-aware registered domains across train, validation, and test",
        "random_state": RANDOM_STATE,
        "validation_fpr_budget": FPR_BUDGET,
        "validation_selected_threshold": float(selected["threshold"]) if selected else None,
        "validation_selected_metrics": selected,
        "test_metrics_threshold_0_50": test_fixed,
        "test_metrics_validation_selected_threshold": test_selected,
        "test_source_metrics_threshold_0_50": source_metrics(test_idx, test_scores, 0.50),
        "architecture": {"type": "MLPClassifier", "hidden_layers": [64, 32], "activation": "relu", "optimizer": "adam", "regularization_alpha": 0.001, "early_stopping": True},
        "training_iterations": int(model.named_steps["mlp"].n_iter_),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "warning": "Research candidate only. Metrics come from a domain-separated mixed public corpus and do not establish current real-world performance; labels may be stale/noisy and an independent contemporary evaluation remains necessary.",
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved candidate model: {MODEL_PATH}")
    print(f"Saved candidate metrics: {METRICS_PATH}")
    print("\nValidation selected threshold:", metrics["validation_selected_threshold"])
    print("Test metrics at threshold 0.50:")
    print(json.dumps(test_fixed, indent=2))
    print("Test metrics at validation-selected threshold:")
    print(json.dumps(test_selected, indent=2))
    print("Test metrics by source-provenance group at 0.50:")
    print(json.dumps(metrics["test_source_metrics_threshold_0_50"], indent=2))
    print("\nCandidate saved separately. No production or v3 candidate artifact was changed.")


if __name__ == "__main__":
    main()
