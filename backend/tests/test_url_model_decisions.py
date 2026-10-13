import pytest

from app.services.url_model import classify_score


@pytest.mark.parametrize(
    ("score", "expected_prediction", "expected_risk"),
    [
        (0.00, "low_signal", "low"),
        (0.10, "low_signal", "low"),
        (0.20, "low_signal", "low"),
        (0.2001, "uncertain", "uncertain"),
        (0.2849, "uncertain", "uncertain"),
        (0.4999, "uncertain", "uncertain"),
        (0.50, "uncertain", "medium"),
        (0.81, "uncertain", "medium"),
        (0.8199, "uncertain", "medium"),
        (0.82, "phishing", "high"),
        (0.999, "phishing", "high"),
        (1.00, "phishing", "high"),
    ],
)
def test_triage_decision_bands(score, expected_prediction, expected_risk):
    assert classify_score(score) == (expected_prediction, expected_risk)


@pytest.mark.parametrize("score", [-0.01, 1.01, float("nan"), float("inf")])
def test_triage_rejects_invalid_scores(score):
    with pytest.raises(ValueError):
        classify_score(score)


def test_triage_rejects_overlapping_or_invalid_thresholds():
    with pytest.raises(ValueError):
        classify_score(0.5, low_threshold=0.8, high_threshold=0.7)
    with pytest.raises(ValueError):
        classify_score(0.5, low_threshold=-0.1, high_threshold=0.8)
