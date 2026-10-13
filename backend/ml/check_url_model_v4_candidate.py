"""Run v4 candidate format and representative benign/deceptive-structure checks.

This is a regression gate, not a general accuracy evaluation. It never visits
submitted URLs and never promotes or changes any model artifact.
"""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from app.services.url_features import NORMALIZATION_VERSION, URL_FEATURE_NAMES, extract_url_features

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
CANDIDATE_PATH = MODEL_DIR / "url_mlp_v4_candidate.joblib"
METRICS_PATH = MODEL_DIR / "url_mlp_v4_candidate_metrics.json"

# These are regression examples of ordinary routes on well-known legitimate
# sites, not whitelist entries and not proof that arbitrary URLs are safe.
BENIGN_PATH_SANITY_URLS = (
    "https://www.google.com/",
    "https://www.google.com/search?q=example",
    "https://www.wikipedia.org/",
    "https://en.wikipedia.org/wiki/URL",
    "https://www.python.org/downloads/",
    "https://learn.microsoft.com/en-us/azure/defender-for-cloud/secure-score-security-controls",
)

# Synthetic deceptive-structure examples only; they are not labelled as real
# observed phishing events and must not be included as training labels.
DECEPTIVE_STRUCTURE_URLS = (
    "https://google.com.example.org/",
    "https://google.com@evil.example/",
)

VARIANT_GROUPS = (
    ("Google root", ("https://www.google.com", "https://www.google.com/", "http://google.com/")),
    ("Wikipedia root", ("https://www.wikipedia.org", "https://www.wikipedia.org/", "http://wikipedia.org/")),
    ("Example root", ("https://example.com", "https://example.com/", "https://www.example.com/")),
    ("BBC co.uk root", ("https://www.bbc.co.uk", "https://bbc.co.uk/", "http://bbc.co.uk/")),
)


def score(model, url: str) -> float:
    row = np.asarray([extract_url_features(url)], dtype=np.float64)
    probabilities = model.predict_proba(row)[0]
    classes = list(model.classes_)
    if 1 not in classes:
        raise RuntimeError(f"Unexpected candidate classes: {classes!r}")
    return float(probabilities[classes.index(1)])


def main() -> None:
    if not CANDIDATE_PATH.is_file():
        raise SystemExit(f"V4 candidate not found: {CANDIDATE_PATH}. Train it first.")
    if not METRICS_PATH.is_file():
        raise SystemExit(f"V4 candidate metrics not found: {METRICS_PATH}.")
    model = joblib.load(CANDIDATE_PATH)
    if list(getattr(model, "threatlens_feature_names_", [])) != list(URL_FEATURE_NAMES):
        raise SystemExit("Candidate feature schema is incompatible; do not promote.")
    if getattr(model, "threatlens_normalization_version_", None) != NORMALIZATION_VERSION:
        raise SystemExit("Candidate normalization version is incompatible; do not promote.")
    if sorted(getattr(model, "classes_", [])) != [0, 1]:
        raise SystemExit(f"Candidate class labels are unexpected: {getattr(model, 'classes_', None)!r}")

    print("Candidate:", getattr(model, "threatlens_model_name_", "unnamed"))
    print("Feature count:", len(URL_FEATURE_NAMES), "| Normalization:", NORMALIZATION_VERSION)
    failures: list[str] = []

    print("\n--- Scheme/www/root-slash invariance ---")
    for name, urls in VARIANT_GROUPS:
        rows = [extract_url_features(url) for url in urls]
        scores = [score(model, url) for url in urls]
        passed = all(row == rows[0] for row in rows[1:]) and all(abs(item - scores[0]) < 1e-12 for item in scores[1:])
        print(f"{name}: pass={passed}")
        for url, value in zip(urls, scores):
            print(f"  p_phishing={value:.4f} {url}")
        if not passed:
            failures.append(f"format invariance: {name}")

    print("\n--- Benign route regression gate (each score must be < 0.50) ---")
    for url in BENIGN_PATH_SANITY_URLS:
        value = score(model, url)
        passed = value < 0.50
        print(f"p_phishing={value:.4f} pass={passed} {url}")
        if not passed:
            failures.append(f"benign route false positive: {url}")

    print("\n--- Synthetic deceptive URL structures (diagnostic only) ---")
    for url in DECEPTIVE_STRUCTURE_URLS:
        value = score(model, url)
        print(f"p_phishing={value:.4f} {url}")

    print("\nNo website was visited. This gate is only a small regression suite.")
    if failures:
        print("Candidate failed:")
        for failure in failures:
            print(" -", failure)
        raise SystemExit("V4 candidate is not eligible for promotion.")
    print("Candidate passed preliminary URL-format and benign-route regression checks.")
    print("Independent, contemporary labelled evaluation is still required before production use.")


if __name__ == "__main__":
    main()
