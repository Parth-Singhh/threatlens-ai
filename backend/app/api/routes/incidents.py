
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DatabaseSession, require_roles
from app.models.incident import Incident
from app.models.user import User
from app.schemas.incident import (
    IncidentCreate,
    IncidentResponse,
    IncidentUpdate,
)


router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

ClientUser = Annotated[User, Depends(require_roles("client"))]
AnalystUser = Annotated[
    User,
    Depends(require_roles("analyst", "admin")),
]


@router.post(
    "",
    response_model=IncidentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_incident(
    payload: IncidentCreate,
    db: DatabaseSession,
    current_user: ClientUser,
) -> IncidentResponse:
    """Create an incident for the authenticated client."""
    incident = Incident(
        reporter_id=current_user.id,
        incident_type=payload.incident_type,
        title=payload.title.strip(),
        description=payload.description.strip(),
        evidence_reference=(
            payload.evidence_reference.strip()
            if payload.evidence_reference
            and payload.evidence_reference.strip()
            else None
        ),
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
    """Clients see their own incidents; staff see all incidents."""
    query = select(Incident)

    if current_user.role == "client":
        query = query.where(
            Incident.reporter_id == current_user.id
        )

    incidents = db.scalars(
        query.order_by(
            Incident.created_at.desc(),
            Incident.id.desc(),
        )
        .offset(skip)
        .limit(limit)
    ).all()

    return [
        IncidentResponse.model_validate(item)
        for item in incidents
    ]


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(
    incident_id: int,
    db: DatabaseSession,
    current_user: CurrentUser,
) -> IncidentResponse:
    """Get an incident, enforcing client ownership."""
    incident = db.get(Incident, incident_id)

    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        )

    if (
        current_user.role == "client"
        and incident.reporter_id != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        )

    return IncidentResponse.model_validate(incident)


@router.patch(
    "/{incident_id}",
    response_model=IncidentResponse,
)
def update_incident(
    incident_id: int,
    payload: IncidentUpdate,
    db: DatabaseSession,
    current_user: AnalystUser,
) -> IncidentResponse:
    """Allow analysts/admins to assign and update incidents."""
    incident = db.get(Incident, incident_id)

    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found.",
        )

    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a status or assignee to update.",
        )

    if "status" in updates and updates["status"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status cannot be null.",
        )

    target_assignee_id = updates.get(
        "assigned_analyst_id",
        incident.assigned_analyst_id,
    )
    target_status = updates.get("status", incident.status)

    if target_assignee_id is not None:
        assignee = db.get(User, target_assignee_id)

        if (
            assignee is None
            or not assignee.is_active
            or assignee.role != "analyst"
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The assignee must be an active analyst account.",
            )

    if target_status == "assigned" and target_assignee_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assign an analyst before using the assigned status.",
        )

    if "assigned_analyst_id" in updates:
        incident.assigned_analyst_id = target_assignee_id

        # Automatically mark a newly assigned submission as assigned.
        if (
            target_assignee_id is not None
            and incident.status == "submitted"
            and "status" not in updates
        ):
            incident.status = "assigned"

    if "status" in updates:
        incident.status = updates["status"]

    db.commit()
    db.refresh(incident)

    return IncidentResponse.model_validate(incident)
