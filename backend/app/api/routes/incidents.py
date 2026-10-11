from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DatabaseSession, require_roles
from app.models.incident import Incident
from app.models.user import User
from app.schemas.incident import IncidentCreate, IncidentResponse


router = APIRouter(prefix="/api/incidents", tags=["Incidents"])
ClientUser = Annotated[User, Depends(require_roles("client"))]


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: IncidentCreate,
    db: DatabaseSession,
    current_user: ClientUser,
) -> IncidentResponse:
    """Create a security incident for the authenticated client."""
    incident = Incident(
        reporter_id=current_user.id,
        incident_type=payload.incident_type,
        title=payload.title.strip(),
        description=payload.description.strip(),
        evidence_reference=payload.evidence_reference.strip()
        if payload.evidence_reference and payload.evidence_reference.strip()
        else None,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return IncidentResponse.model_validate(incident)


@router.get("", response_model=list[IncidentResponse])
def list_incidents(
    db: DatabaseSession,
    current_user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[IncidentResponse]:
    """Clients see their own incidents; analysts and admins can view all incidents."""
    query = select(Incident)
    if current_user.role == "client":
        query = query.where(Incident.reporter_id == current_user.id)

    incidents = db.scalars(
        query.order_by(Incident.created_at.desc(), Incident.id.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return [IncidentResponse.model_validate(item) for item in incidents]


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(
    incident_id: int,
    db: DatabaseSession,
    current_user: CurrentUser,
) -> IncidentResponse:
    """Get an incident, enforcing ownership for client accounts."""
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    if current_user.role == "client" and incident.reporter_id != current_user.id:
        # Return 404 instead of disclosing another client's incident exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    return IncidentResponse.model_validate(incident)
