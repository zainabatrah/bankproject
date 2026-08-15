from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, JSON, String
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