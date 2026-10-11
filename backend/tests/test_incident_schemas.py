import pytest
from pydantic import ValidationError

from app.schemas.incident import IncidentCreate


def test_incident_create_accepts_supported_input() -> None:
    payload = IncidentCreate(
        incident_type="suspicious_email",
        title="Suspicious payroll email",
        description="An unexpected email requests that I confirm my payroll credentials.",
    )
    assert payload.incident_type == "suspicious_email"
    assert payload.evidence_reference is None


def test_incident_create_rejects_unknown_type() -> None:
    with pytest.raises(ValidationError):
        IncidentCreate(
            incident_type="unknown_type",
            title="Suspicious activity",
            description="This description is long enough for validation.",
        )


def test_incident_create_requires_minimum_description_length() -> None:
    with pytest.raises(ValidationError):
        IncidentCreate(
            incident_type="other",
            title="Test incident",
            description="Too short",
        )
