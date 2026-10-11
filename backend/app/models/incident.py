from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint(
            "incident_type IN ('suspicious_email', 'suspicious_url', 'suspicious_message', "
            "'suspicious_file', 'suspicious_screenshot', 'other')",
            name="ck_incidents_type",
        ),
        CheckConstraint(
            "priority IN ('p1', 'p2', 'p3', 'p4')",
            name="ck_incidents_priority",
        ),
        CheckConstraint(
            "status IN ('submitted', 'assigned', 'investigating', 'escalated', "
            "'waiting', 'resolved', 'closed')",
            name="ck_incidents_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reporter_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_analyst_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    incident_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_reference: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    threat_category: Mapped[str] = mapped_column(
        String(60), nullable=False, default="unclassified", server_default="unclassified"
    )
    priority: Mapped[str] = mapped_column(
        String(2), nullable=False, default="p3", server_default="p3"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="submitted", server_default="submitted"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
