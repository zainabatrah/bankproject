from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class FraudAlert(Base):
    __tablename__ = "fraud_alerts"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    amount: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    risk_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    decision: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    ml_probability: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="NEW",
        nullable=False
    )

    reasons: Mapped[list] = mapped_column(
        JSON,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    analyst_notes: Mapped[list] = mapped_column(
        JSON,
        default=list,
        nullable=False
    )

class InvestigationCase(Base):
    __tablename__ = "investigation_cases"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    alert_id: Mapped[int] = mapped_column(
        ForeignKey("fraud_alerts.id"),
        unique=True,
        nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="OPEN",
        nullable=False
    )

    assigned_analyst: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    summary: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True
    )

    outcome: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

class SecurityEvent(Base):
    __tablename__ = "security_events"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True
    )

    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True
    )

    source: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    description: Mapped[str] = mapped_column(
        String(1000),
        nullable=False
    )

    event_data: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True
    )

    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    entity_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    actor: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    details: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )