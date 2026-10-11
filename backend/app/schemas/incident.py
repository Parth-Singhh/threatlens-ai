
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


IncidentType = Literal[
    "suspicious_email",
    "suspicious_url",
    "suspicious_message",
    "suspicious_file",
    "suspicious_screenshot",
    "other",
]

IncidentPriority = Literal["p1", "p2", "p3", "p4"]

IncidentStatus = Literal[
    "submitted",
    "assigned",
    "investigating",
    "escalated",
    "waiting",
    "resolved",
    "closed",
]


class IncidentCreate(BaseModel):
    incident_type: IncidentType
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=10, max_length=5000)
    evidence_reference: str | None = Field(default=None, max_length=1000)


class IncidentUpdate(BaseModel):
    """Fields analysts can update during incident handling."""

    model_config = ConfigDict(extra="forbid")

    status: IncidentStatus | None = None
    assigned_analyst_id: int | None = Field(default=None, ge=1)


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reporter_id: int
    assigned_analyst_id: int | None
    incident_type: IncidentType
    title: str
    description: str
    evidence_reference: str | None
    threat_category: str
    priority: IncidentPriority
    status: IncidentStatus
    created_at: datetime
    updated_at: datetime
