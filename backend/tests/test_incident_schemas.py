import pytest
from pydantic import ValidationError

from app.schemas.incident import IncidentCreate, IncidentUpdate


def make_incident_create(**overrides):
    values = {
        "incident_type": "suspicious_email",
        "title": "Suspicious payroll email",
        "description": "An unexpected email requests that I confirm my payroll credentials.",
    }
    values.update(overrides)
    return IncidentCreate(**values)


def test_incident_create_accepts_supported_input() -> None:
    payload = make_incident_create()
    assert payload.incident_type == "suspicious_email"
    assert payload.evidence_reference is None
    assert payload.priority == "p3"


def test_incident_create_rejects_unknown_type() -> None:
    with pytest.raises(ValidationError):
        make_incident_create(incident_type="unknown_type")


def test_incident_create_requires_minimum_description_length() -> None:
    with pytest.raises(ValidationError):
        make_incident_create(incident_type="other", title="Test incident", description="Too short")


@pytest.mark.parametrize("priority", ["p1", "p2", "p3", "p4"])
def test_client_can_choose_initial_priority(priority: str) -> None:
    payload = make_incident_create(priority=priority)
    assert payload.priority == priority


def test_incident_create_rejects_invalid_priority() -> None:
    with pytest.raises(ValidationError):
        make_incident_create(priority="critical")


@pytest.mark.parametrize("priority", ["p1", "p2", "p3", "p4"])
def test_analyst_can_submit_priority_update(priority: str) -> None:
    payload = IncidentUpdate(priority=priority)
    assert payload.priority == priority


def test_incident_update_rejects_invalid_priority() -> None:
    with pytest.raises(ValidationError):
        IncidentUpdate(priority="urgent")
