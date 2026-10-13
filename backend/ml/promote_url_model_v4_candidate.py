"""Promote v4 only if strict evaluation and regression gates pass.

This script intentionally has conservative acceptance gates. If it refuses
promotion, leave the existing production path untouched and inspect the metrics.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import joblib

from app.services.url_features import NORMALIZATION_VERSION, URL_FEATURE_NAMES, extract_url_features
from ml.check_url_model_v4_candidate import BENIGN_PATH_SANITY_URLS, VARIANT_GROUPS, score

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
PRODUCTION_PATH = MODEL_DIR / "url_mlp.joblib"
PRODUCTION_METRICS_PATH = MODEL_DIR / "url_mlp_metrics.json"
CANDIDATE_PATH = MODEL_DIR / "url_mlp_v4_candidate.joblib"
CANDIDATE_METRICS_PATH = MODEL_DIR / "url_mlp_v4_candidate_metrics.json"
BACKUP_PATH = MODEL_DIR / "url_mlp_pre_v4_backup.joblib"
BACKUP_METRICS_PATH = MODEL_DIR / "url_mlp_pre_v4_backup_metrics.json"
MAX_ACCEPTABLE_FPR = 0.05
MAX_ACCEPTABLE_FNR = 0.05


def main() -> None:
    if not CANDIDATE_PATH.is_file() or not CANDIDATE_METRICS_PATH.is_file():
        raise SystemExit("V4 candidate or metrics are missing; refusing promotion.")
    candidate = joblib.load(CANDIDATE_PATH)
    if list(getattr(candidate, "threatlens_feature_names_", [])) != list(URL_FEATURE_NAMES):
        raise SystemExit("Candidate schema mismatch; refusing promotion.")
    if getattr(candidate, "threatlens_normalization_version_", None) != NORMALIZATION_VERSION:
        raise SystemExit("Candidate normalization version mismatch; refusing promotion.")
    if sorted(getattr(candidate, "classes_", [])) != [0, 1]:
        raise SystemExit("Candidate class mapping is unexpected; refusing promotion.")

    with CANDIDATE_METRICS_PATH.open("r", encoding="utf-8") as handle:
        metrics = json.load(handle)
    if metrics.get("registered_domain_overlap_count") != 0:
        raise SystemExit("Evaluation lacks a zero-overlap domain split; refusing promotion.")
    # Inference currently uses a fixed 0.50 classification threshold. Promotion
    # therefore gates on test metrics at 0.50, not on a different validation-
    # selected threshold that the API would not actually apply.
    selected = metrics.get("test_metrics_threshold_0_50")
    if not isinstance(selected, dict):
        raise SystemExit("Held-out test metrics at the production 0.50 threshold are missing; refusing promotion.")
    fpr = selected.get("false_positive_rate_legitimate")
    fnr = selected.get("false_negative_rate_phishing")
    if not isinstance(fpr, (int, float)) or not isinstance(fnr, (int, float)):
        raise SystemExit("Held-out FPR/FNR are missing; refusing promotion.")
    print(f"Held-out metrics at validation-selected threshold: FPR={fpr:.4%}; FNR={fnr:.4%}")
    if fpr > MAX_ACCEPTABLE_FPR or fnr > MAX_ACCEPTABLE_FNR:
        raise SystemExit(
            f"Refusing promotion: current project gates require FPR <= {MAX_ACCEPTABLE_FPR:.0%} "
            f"and FNR <= {MAX_ACCEPTABLE_FNR:.0%}. No production artifact was changed."
        )

    for group_name, urls in VARIANT_GROUPS:
        rows = [extract_url_features(url) for url in urls]
        values = [score(candidate, url) for url in urls]
        if not all(row == rows[0] for row in rows[1:]) or not all(abs(value - values[0]) < 1e-12 for value in values[1:]):
            raise SystemExit(f"Format invariance failed for {group_name}; refusing promotion.")
    failures = [url for url in BENIGN_PATH_SANITY_URLS if score(candidate, url) >= 0.50]
    if failures:
        raise SystemExit("Benign-route regressions remain; refusing promotion: " + ", ".join(failures))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if PRODUCTION_PATH.exists() and not BACKUP_PATH.exists():
        shutil.copy2(PRODUCTION_PATH, BACKUP_PATH)
    if PRODUCTION_METRICS_PATH.exists() and not BACKUP_METRICS_PATH.exists():
        shutil.copy2(PRODUCTION_METRICS_PATH, BACKUP_METRICS_PATH)
    candidate.threatlens_model_name_ = "ThreatLens URL MLP v4"
    joblib.dump(candidate, PRODUCTION_PATH)
    metrics["model_name"] = "ThreatLens URL MLP v4"
    metrics["validation_status"] = "passed project gates; external contemporary validation still required"
    metrics["promoted_at_utc"] = datetime.now(timezone.utc).isoformat()
    PRODUCTION_METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print("Promoted v4 candidate to production path:", PRODUCTION_PATH)


if __name__ == "__main__":
    main()
