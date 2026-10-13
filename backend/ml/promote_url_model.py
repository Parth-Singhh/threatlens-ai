"""Promote a candidate only after format-invariance and benign sanity checks."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import joblib

from app.services.url_features import NORMALIZATION_VERSION, URL_FEATURE_NAMES, extract_url_features
from ml.check_url_model_candidate import BENIGN_SANITY_URLS, VARIANT_GROUPS, phishing_score

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
PRODUCTION_PATH = MODEL_DIR / "url_mlp.joblib"
PRODUCTION_METRICS_PATH = MODEL_DIR / "url_mlp_metrics.json"
BACKUP_PATH = MODEL_DIR / "url_mlp_v1_backup.joblib"
BACKUP_METRICS_PATH = MODEL_DIR / "url_mlp_v1_backup_metrics.json"
CANDIDATE_PATH = MODEL_DIR / "url_mlp_candidate.joblib"
CANDIDATE_METRICS_PATH = MODEL_DIR / "url_mlp_candidate_metrics.json"
MAX_ACCEPTABLE_FPR = 0.05
MAX_ACCEPTABLE_FNR = 0.05


def main() -> None:
    if not CANDIDATE_PATH.is_file():
        raise SystemExit(f"Candidate not found: {CANDIDATE_PATH}")

    candidate = joblib.load(CANDIDATE_PATH)
    if list(getattr(candidate, "threatlens_feature_names_", [])) != list(URL_FEATURE_NAMES):
        raise SystemExit("Candidate feature schema is missing or mismatched; refusing promotion.")
    if getattr(candidate, "threatlens_normalization_version_", None) != NORMALIZATION_VERSION:
        raise SystemExit("Candidate normalization version is incompatible; refusing promotion.")

    for group_name, urls in VARIANT_GROUPS:
        features = [extract_url_features(url) for url in urls]
        scores = [phishing_score(candidate, url) for url in urls]
        if not all(row == features[0] for row in features[1:]) or not all(abs(s - scores[0]) < 1e-12 for s in scores[1:]):
            raise SystemExit(f"Refusing promotion: format invariance failed for {group_name}.")

    if not CANDIDATE_METRICS_PATH.is_file():
        raise SystemExit("Candidate metrics are missing; refusing promotion.")
    with CANDIDATE_METRICS_PATH.open("r", encoding="utf-8") as handle:
        metrics = json.load(handle)
    if metrics.get("shared_registered_domain_count") != 0:
        raise SystemExit("Candidate evaluation is missing a zero-overlap registered-domain split; refusing promotion.")
    fpr = metrics.get("false_positive_rate_legitimate")
    fnr = metrics.get("false_negative_rate_phishing")
    if not isinstance(fpr, (int, float)) or not isinstance(fnr, (int, float)):
        raise SystemExit("Candidate metrics do not include the required FPR/FNR values; refusing promotion.")
    print(f"Domain-held-out metrics: FPR={fpr:.4f}; FNR={fnr:.4f}")
    if fpr > MAX_ACCEPTABLE_FPR or fnr > MAX_ACCEPTABLE_FNR:
        raise SystemExit(
            f"Refusing promotion: preliminary research gates require FPR <= {MAX_ACCEPTABLE_FPR:.0%} "
            f"and FNR <= {MAX_ACCEPTABLE_FNR:.0%}. These are project acceptance gates, not universal thresholds."
        )

    failures = []
    for url in BENIGN_SANITY_URLS:
        score = phishing_score(candidate, url)
        print(f"Pre-promotion sanity check: {url} -> phishing score {score:.4f}")
        if score >= 0.5:
            failures.append(url)
    if failures:
        raise SystemExit("Refusing promotion: candidate flags benign sanity URLs: " + ", ".join(failures))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if PRODUCTION_PATH.exists() and not BACKUP_PATH.exists():
        shutil.copy2(PRODUCTION_PATH, BACKUP_PATH)
        print("Preserved previous production model:", BACKUP_PATH)
    if PRODUCTION_METRICS_PATH.exists() and not BACKUP_METRICS_PATH.exists():
        shutil.copy2(PRODUCTION_METRICS_PATH, BACKUP_METRICS_PATH)
        print("Preserved previous metrics:", BACKUP_METRICS_PATH)

    shutil.copy2(CANDIDATE_PATH, PRODUCTION_PATH)
    if CANDIDATE_METRICS_PATH.exists():
        metrics["model_name"] = "ThreatLens URL MLP v3"
        metrics["validation_status"] = "passed preliminary regression gates; independent external validation still required"
        metrics["promoted_at_utc"] = datetime.now(timezone.utc).isoformat()
        PRODUCTION_METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print("Promoted candidate to:", PRODUCTION_PATH)
    print("This promotion only passes limited regression gates; do not claim production readiness without independent validation.")


if __name__ == "__main__":
    main()
