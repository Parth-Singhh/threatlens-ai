import math

import pytest

from app.services.url_features import URL_FEATURE_NAMES, extract_url_features, normalize_url


def test_url_normalization_adds_scheme() -> None:
    assert normalize_url("example.com/path") == "http://example.com/path"


def test_features_are_stable_and_finite() -> None:
    features = extract_url_features("https://example.com/account/verify?id=123")
    assert len(features) == len(URL_FEATURE_NAMES)
    assert all(math.isfinite(value) for value in features)


def test_feature_flags_detect_simple_url_characteristics() -> None:
    features = dict(zip(URL_FEATURE_NAMES, extract_url_features("http://192.0.2.4/login?token=123")))
    assert features["host_is_ip"] == 1.0
    assert features["suspicious_term_count"] >= 1.0
    assert "is_http" not in features
    assert "is_https" not in features
    assert "has_www_prefix" not in features


@pytest.mark.parametrize("value", ["", "   ", "https:///path", "bad url .com"])
def test_invalid_url_is_rejected(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_url(value)
