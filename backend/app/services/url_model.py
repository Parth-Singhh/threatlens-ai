"""Version-checked URL MLP inference with conservative triage for the college demo.

The v4 model is deliberately exposed only as an explicitly named experimental demo
candidate. Its score is not calibrated and must not be interpreted as a probability
that a URL is actually malicious. Predictions are advisory and human review remains
required.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.services.url_features import (
    NORMALIZATION_VERSION,
    URL_FEATURE_NAMES,
    explain_url_signals,
    extract_url_features,
    normalize_url,
)

MODEL_DIR = Path(__file__).resolve().parents[2] / "models"
MODEL_MODE = os.getenv("THREATLENS_URL_MODEL_MODE", "production").strip().lower()
LOW_SCORE_THRESHOLD_CONFIG = os.getenv("THREATLENS_URL_LOW_SCORE_THRESHOLD", "0.20")


class ModelNotReadyError(RuntimeError):
    """Raised when a compatible model artifact is not available."""


def _artifact_paths() -> tuple[Path, Path, str]:
    if MODEL_MODE == "experimental-v4":
        return (
            MODEL_DIR / "url_mlp_v4_candidate.joblib",
            MODEL_DIR / "url_mlp_v4_candidate_metrics.json",
            "experimental-demo",
        )
    if MODEL_MODE == "production":
        return (
            MODEL_DIR / "url_mlp.joblib",
            MODEL_DIR / "url_mlp_metrics.json",
            "production",
        )
    raise ModelNotReadyError(
        "Unsupported THREATLENS_URL_MODEL_MODE. Use 'production' or explicitly set "
        "'experimental-v4' for the research/demo candidate."
    )


@lru_cache(maxsize=1)
def _load_model() -> Any:
    model_path, metrics_path, _ = _artifact_paths()
    if not model_path.is_file():
        mode_hint = (
            "Train the v4 candidate and run its regression gate first."
            if MODEL_MODE == "experimental-v4"
            else "No compatible production model is installed. Do not point production mode at an unvalidated candidate."
        )
        raise ModelNotReadyError(f"URL model artifact missing at {model_path}. {mode_hint}")
    try:
        model = joblib.load(model_path)
    except Exception as exc:
        raise ModelNotReadyError("URL model artifact could not be loaded.") from exc

    names = getattr(model, "threatlens_feature_names_", None)
    version = getattr(model, "threatlens_normalization_version_", None)
    if names is None or list(names) != list(URL_FEATURE_NAMES):
        raise ModelNotReadyError("Saved URL model feature schema does not match inference; refusing to predict.")
    if version != NORMALIZATION_VERSION:
        raise ModelNotReadyError(
            f"Saved model normalization {version!r} does not match active normalization {NORMALIZATION_VERSION!r}."
        )
    if hasattr(model, "n_features_in_") and int(model.n_features_in_) != len(URL_FEATURE_NAMES):
        raise ModelNotReadyError("Saved model feature count does not match inference; refusing to predict.")
    if sorted(getattr(model, "classes_", [])) != [0, 1]:
        raise ModelNotReadyError("Expected classes [0=legitimate, 1=phishing]; refusing to predict.")
    if not metrics_path.is_file():
        raise ModelNotReadyError(f"Model metrics metadata missing at {metrics_path}; thresholds cannot be checked.")
    try:
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ModelNotReadyError("Model metrics metadata is unreadable; refusing to predict.") from exc

    if MODEL_MODE == "experimental-v4":
        if not bool(metrics.get("candidate_only", False)):
            raise ModelNotReadyError("The v4 artifact is not marked as a candidate; refusing experimental-mode inference.")
        high_threshold = metrics.get("validation_selected_threshold")
        if not isinstance(high_threshold, (int, float)) or not 0.5 <= float(high_threshold) <= 1.0:
            raise ModelNotReadyError("The v4 candidate has no valid validation-selected high-score threshold.")
        model.threatlens_model_name_ = "ThreatLens URL MLP v4 — Experimental Demo"
        model.threatlens_mode_ = "experimental-demo"
        model.threatlens_decision_threshold_ = float(high_threshold)
        model.threatlens_metrics_ = metrics
    else:
        # Production artifacts must already have passed the explicit promotion gate.
        if not metrics.get("validation_status"):
            raise ModelNotReadyError("Production model is missing promotion/validation metadata.")
        decision_threshold = metrics.get("decision_threshold", 0.50)
        if not isinstance(decision_threshold, (int, float)) or not 0.0 < float(decision_threshold) < 1.0:
            raise ModelNotReadyError("Production model decision threshold is invalid.")
        model.threatlens_model_name_ = str(metrics.get("model_name", "ThreatLens URL MLP"))
        model.threatlens_mode_ = "production"
        model.threatlens_decision_threshold_ = float(decision_threshold)

    try:
        low_score_threshold = float(LOW_SCORE_THRESHOLD_CONFIG)
    except ValueError as exc:
        raise ModelNotReadyError("THREATLENS_URL_LOW_SCORE_THRESHOLD must be numeric.") from exc
    if not 0.0 <= low_score_threshold < float(model.threatlens_decision_threshold_):
        raise ModelNotReadyError("Low-score threshold must be nonnegative and below the high-score threshold.")
    model.threatlens_low_score_threshold_ = low_score_threshold
    return model


def clear_model_cache() -> None:
    """Clear cached inference after an artifact or runtime configuration changes."""
    _load_model.cache_clear()


def classify_score(
    phishing_score: float,
    *,
    low_threshold: float = 0.20,
    high_threshold: float = 0.82,
) -> tuple[str, str]:
    """Return a conservative triage state and display risk band.

    Values between thresholds remain uncertain instead of being silently treated
    as benign or malicious. Thresholds are policy cutoffs, not calibrated probability
    guarantees; high_threshold should come from validation metadata.
    """
    if not 0.0 <= phishing_score <= 1.0:
        raise ValueError("Phishing score must be between 0 and 1.")
    if not 0.0 <= low_threshold < high_threshold <= 1.0:
        raise ValueError("Thresholds must satisfy 0 <= low < high <= 1.")
    if phishing_score >= high_threshold:
        return "phishing", "high"
    if phishing_score <= low_threshold:
        return "low_signal", "low"
    if phishing_score >= 0.50:
        return "uncertain", "medium"
    return "uncertain", "uncertain"


def analyze_url(value: str) -> dict[str, object]:
    normalized = normalize_url(value)
    model = _load_model()
    features = np.asarray([extract_url_features(normalized)], dtype=np.float64)
    probabilities = model.predict_proba(features)[0]
    classes = list(model.classes_)
    if 1 not in classes:
        raise ModelNotReadyError("Trained model has no class 1=phishing output.")
    score = float(probabilities[classes.index(1)])
    if not np.isfinite(score) or not 0.0 <= score <= 1.0:
        raise ModelNotReadyError("Model returned an invalid phishing score.")

    low_threshold = float(model.threatlens_low_score_threshold_)
    high_threshold = float(model.threatlens_decision_threshold_)
    prediction, risk_level = classify_score(
        score, low_threshold=low_threshold, high_threshold=high_threshold
    )
    # Kept for API compatibility. It is intentionally not displayed as calibrated
    # confidence in the frontend; the raw model score is not calibrated.
    confidence = max(score, 1.0 - score)
    mode = str(model.threatlens_mode_)
    mode_note = "Model results require independent, contemporary evaluation and analyst review. "
    if mode == "experimental-demo":
        metrics = getattr(model, "threatlens_metrics_", {})
        fixed = metrics.get("test_metrics_threshold_0_50", {})
        selected = metrics.get("test_metrics_validation_selected_threshold", {})
        fixed_fpr = fixed.get("false_positive_rate_legitimate")
        fixed_fnr = fixed.get("false_negative_rate_phishing")
        selected_fpr = selected.get("false_positive_rate_legitimate")
        selected_fnr = selected.get("false_negative_rate_phishing")
        if all(isinstance(value, (int, float)) for value in (fixed_fpr, fixed_fnr, selected_fpr, selected_fnr)):
            mode_note = (
                "Experimental research candidate. Its registered-domain-separated test reported "
                f"FPR={float(fixed_fpr):.2%} and FNR={float(fixed_fnr):.2%} at threshold 0.50; "
                f"at the validation-selected threshold {high_threshold:.2f}, FPR={float(selected_fpr):.2%} "
                f"and FNR={float(selected_fnr):.2%}. These dataset metrics do not establish contemporary real-world performance. "
            )
        else:
            mode_note = "Experimental research candidate; complete test FPR/FNR metrics are missing. Do not use for operational decisions. "
    return {
        "url": normalized,
        "prediction": prediction,
        "phishing_probability": round(score, 4),
        "confidence": round(confidence, 4),
        "risk_level": risk_level,
        "model_name": str(model.threatlens_model_name_),
        "model_mode": mode,
        "decision_threshold": round(high_threshold, 4),
        "low_score_threshold": round(low_threshold, 4),
        "signals": explain_url_signals(normalized),
        "explanation_note": (
            mode_note
            + f"Triage policy: scores >= {high_threshold:.2f} are flagged for phishing review; "
            + f"scores <= {low_threshold:.2f} receive a low-score label; intermediate scores are uncertain. "
            + "The low-score label does not prove safety; raw model scores are not calibrated real-world probabilities. "
            + "Human review is required. This endpoint inspects the URL string only and does not fetch the website."
        ),
    }
