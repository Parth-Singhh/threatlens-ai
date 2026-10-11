"""Load and run the trained ThreatLens URL MLP model."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.services.url_features import explain_url_signals, extract_url_features, normalize_url

MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "url_mlp.joblib"
MODEL_NAME = "ThreatLens URL MLP v1"


class ModelNotReadyError(RuntimeError):
    """Raised when training has not produced a model artifact yet."""


@lru_cache(maxsize=1)
def _load_model() -> Any:
    if not MODEL_PATH.is_file():
        raise ModelNotReadyError(
            "The URL model has not been trained yet. Run: "
            "docker exec -it threatlens-api python -m ml.train_url_model"
        )
    try:
        return joblib.load(MODEL_PATH)
    except Exception as exc:
        raise ModelNotReadyError(
            "The URL model artifact could not be loaded. Retrain it using the provided training command."
        ) from exc


def clear_model_cache() -> None:
    """Clear the cached model after a model artifact is replaced."""
    _load_model.cache_clear()


def analyze_url(value: str) -> dict[str, object]:
    normalized = normalize_url(value)
    model = _load_model()
    features = np.asarray([extract_url_features(normalized)], dtype=np.float64)
    probabilities = model.predict_proba(features)[0]
    classes = list(model.classes_)
    phishing_index = classes.index(1)
    phishing_probability = float(probabilities[phishing_index])
    prediction = "phishing" if phishing_probability >= 0.5 else "legitimate"
    confidence = phishing_probability if prediction == "phishing" else 1.0 - phishing_probability

    if phishing_probability >= 0.80:
        risk_level = "high"
    elif phishing_probability >= 0.55:
        risk_level = "medium"
    elif phishing_probability <= 0.20:
        risk_level = "low"
    else:
        risk_level = "uncertain"

    return {
        "url": normalized,
        "prediction": prediction,
        "phishing_probability": round(phishing_probability, 4),
        "confidence": round(confidence, 4),
        "risk_level": risk_level,
        "model_name": MODEL_NAME,
        "signals": explain_url_signals(normalized),
        "explanation_note": (
            "Signals are human-readable URL characteristics, not feature-attribution explanations "
            "from the neural network. A model prediction is not a guarantee of safety or maliciousness."
        ),
    }
