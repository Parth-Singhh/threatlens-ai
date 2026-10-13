"""Check candidate feature invariance and benign regression URLs; never promotes."""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from app.services.url_features import (
    NORMALIZATION_VERSION,
    URL_FEATURE_NAMES,
    extract_url_features,
    normalize_url,
)

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
CANDIDATE_PATH = MODEL_DIR / "url_mlp_candidate.joblib"

# Regression examples only. No domain-specific logic or whitelist runs in inference.
BENIGN_SANITY_URLS = (
    "https://www.google.com/",
    "https://www.wikipedia.org/",
    "https://example.com/",
)

VARIANT_GROUPS = (
    ("Google root", ("https://www.google.com", "https://www.google.com/", "http://google.com/")),
    ("Wikipedia root", ("https://www.wikipedia.org", "https://www.wikipedia.org/", "http://wikipedia.org/")),
    ("Example root", ("https://example.com", "https://example.com/", "https://www.example.com/")),
    ("BBC co.uk root", ("https://www.bbc.co.uk", "https://bbc.co.uk/", "http://bbc.co.uk/")),
)


def phishing_score(model, url: str) -> float:
    row = np.asarray([extract_url_features(url)], dtype=np.float64)
    probabilities = model.predict_proba(row)[0]
    classes = list(model.classes_)
    if 1 not in classes:
        raise RuntimeError(f"Candidate has unexpected class labels: {classes!r}")
    return float(probabilities[classes.index(1)])


def main() -> None:
    if not CANDIDATE_PATH.is_file():
        raise SystemExit(f"Candidate not found: {CANDIDATE_PATH}. Train the candidate first.")

    model = joblib.load(CANDIDATE_PATH)
    schema = getattr(model, "threatlens_feature_names_", None)
    version = getattr(model, "threatlens_normalization_version_", None)
    if list(schema or []) != list(URL_FEATURE_NAMES):
        raise SystemExit("Candidate feature schema is missing or mismatched; do not promote it.")
    if version != NORMALIZATION_VERSION:
        raise SystemExit(f"Candidate version {version!r} does not match {NORMALIZATION_VERSION!r}.")
    if sorted(getattr(model, "classes_", [])) != [0, 1]:
        raise SystemExit(f"Candidate has unexpected classes: {getattr(model, 'classes_', None)!r}")

    print("Candidate model:", getattr(model, "threatlens_model_name_", "unnamed"))
    print("Normalization:", version)
    print("Feature count:", len(URL_FEATURE_NAMES))

    print("\n--- Scheme/www/root-slash feature and score invariance ---")
    for group_name, urls in VARIANT_GROUPS:
        feature_rows = [extract_url_features(url) for url in urls]
        scores = [phishing_score(model, url) for url in urls]
        invariant = all(row == feature_rows[0] for row in feature_rows[1:]) and all(
            abs(score - scores[0]) < 1e-12 for score in scores[1:]
        )
        print(f"{group_name}: invariant={invariant}")
        for url, score in zip(urls, scores):
            print(f"  {url:42} phishing_score={score:.4f}")
        if not invariant:
            raise SystemExit(f"Candidate failed format-invariance check for {group_name}.")

    print("\n--- Benign-root sanity gate (all must be below 0.50) ---")
    failed = []
    for url in BENIGN_SANITY_URLS:
        score = phishing_score(model, url)
        pred = "phishing" if score >= 0.5 else "legitimate"
        passed = score < 0.5
        print(f"{url:38} prediction={pred:10} phishing_score={score:.4f} pass={passed}")
        if not passed:
            failed.append(url)

    print("\nNo website was visited. These are limited regression gates, not a general accuracy evaluation.")
    if failed:
        raise SystemExit(
            "Candidate failed the benign-root sanity gate; do not promote. More representative labelled data or revised features are required."
        )
    print("Candidate passed preliminary smoke/regression checks only. Independent evaluation is still required before production claims.")


if __name__ == "__main__":
    main()
