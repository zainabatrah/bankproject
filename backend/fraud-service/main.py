from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle
)
import csv
import io
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import SessionLocal
from db_models import AuditLog, FraudAlert, InvestigationCase, SecurityEvent

import joblib
import pandas as pd

from pydantic import BaseModel
from pydantic import BaseModel, Field



# Create the FastAPI application
app = FastAPI(title="Bank Fraud Detection API")

ml_model = joblib.load("models/logistic_regression.joblib")

# This opens a database connection for a request and closes it afterward.
def get_database():
    database = SessionLocal()

    try:
        yield database
    finally:
        database.close()

# This prepares an event and adds it to the current database session.
def log_security_event(
    database: Session,
    event_type: str,
    severity: str,
    description: str,
    event_data: dict
):
    event = SecurityEvent(
        event_type=event_type,
        severity=severity,
        source="fraud-engine",
        description=description,
        event_data=event_data
    )

    database.add(event)

    return event

def log_audit_action(
    database: Session,
    action: str,
    entity_type: str,
    entity_id: int,
    actor: str,
    details: dict
):
    audit_log = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor=actor,
        details=details
    )

    database.add(audit_log)

    return audit_log

# Define the transaction data expected from the banking application
class Transaction(BaseModel):
    amount: float = Field(gt=0)
    average_amount: float = Field(gt=0)
    new_device: bool
    new_beneficiary: bool
    transactions_last_hour: int = Field(ge=0)
    failed_logins_last_hour: int = Field(ge=0)
    transaction_hour: int = Field(ge=0, le=23)


def analyze_transaction(transaction: Transaction):
    risk_score = 0
    reasons = []

    if transaction.amount > transaction.average_amount * 5:
        risk_score += 40
        reasons.append("Unusual transaction amount")

    if transaction.new_device:
        risk_score += 20
        reasons.append("Transaction made from a new device")

    if transaction.new_beneficiary:
        risk_score += 20
        reasons.append("Transaction sent to a new beneficiary")

    if transaction.transactions_last_hour >= 5:
        risk_score += 20
        reasons.append("Too many transactions in one hour")

        # Rule 5: Repeated failed login attempts
    if transaction.failed_logins_last_hour >= 3:
        risk_score += 20
        reasons.append("Repeated failed login attempts")

    # Rule 6: Transaction made between midnight and 5 AM
    if 0 <= transaction.transaction_hour < 5:
        risk_score += 10
        reasons.append("Transaction made at an unusual time")

    risk_score = min(risk_score, 100)

    if risk_score >= 80:
        severity = "CRITICAL"
    elif risk_score >= 60:
        severity = "HIGH"
    elif risk_score >= 30:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    if severity == "LOW":
        decision = "APPROVE"
    elif severity == "CRITICAL":
        decision = "BLOCK"
    else:
        decision = "REVIEW"

    return {
        "risk_score": risk_score,
        "severity": severity,
        "decision": decision,
        "reasons": reasons
    }
# Using Literal means FastAPI accepts only these four statuses.
class AlertStatusUpdate(BaseModel):
    status: Literal[
        "NEW",
        "INVESTIGATING",
        "RESOLVED",
        "FALSE_POSITIVE"
    ]

    actor: str = Field(
        min_length=1,
        max_length=100
    )

class AnalystNoteCreate(BaseModel):
    note: str = Field(min_length=1, max_length=1000)

class InvestigationCaseCreate(BaseModel):
    alert_id: int = Field(gt=0)
    assigned_analyst: str | None = Field(
        default=None,
        max_length=100
    )
    summary: str | None = Field(
        default=None,
        max_length=1000
    )

class InvestigationCaseStatusUpdate(BaseModel):
    status: Literal[
        "OPEN",
        "IN_PROGRESS",
        "CLOSED"
    ]

    outcome: Literal[
        "CONFIRMED_FRAUD",
        "FALSE_POSITIVE",
        "UNRESOLVED"
    ] | None = None

    actor: str = Field(
        min_length=1,
        max_length=100
    )

class SecurityEventCreate(BaseModel):
    event_type: Literal[
        "FAILED_LOGIN",
        "NEW_DEVICE",
        "SUSPICIOUS_TRANSACTION",
        "FRAUD_ALERT_CREATED",
        "CASE_STATUS_CHANGED"
    ]

    severity: Literal[
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL"
    ]

    source: str = Field(
        min_length=1,
        max_length=100
    )

    description: str = Field(
        min_length=1,
        max_length=1000
    )

    event_data: dict = Field(default_factory=dict)
# Simple endpoint to check whether the API is running
@app.get("/")
def home():
    return {"message": "Bank Fraud Detection API is running"}


# Endpoint that analyzes a transaction
@app.post("/analyze")
def analyze(transaction: Transaction):
    return analyze_transaction(transaction)

@app.post("/predict")
def predict_fraud(transaction: Transaction):
    transaction_data = pd.DataFrame([
        transaction.model_dump()
    ])

    prediction = int(
        ml_model.predict(transaction_data)[0]
    )

    fraud_probability = float(
        ml_model.predict_proba(transaction_data)[0][1]
    )

    return {
        "prediction": prediction,
        "is_fraud": prediction == 1,
        "fraud_probability": round(fraud_probability, 4)
    }

@app.post("/evaluate")
def evaluate_transaction(
    transaction: Transaction,
    database: Session = Depends(get_database)
):
    # Run the rule-based engine
    rule_result = analyze_transaction(transaction)

    # Prepare transaction data for machine learning
    transaction_data = pd.DataFrame([
        transaction.model_dump()
    ])

    # Run the ML model
    ml_prediction = int(
        ml_model.predict(transaction_data)[0]
    )

    ml_probability = float(
        ml_model.predict_proba(transaction_data)[0][1]
    )

    # Create an alert when rules or ML identify high risk
    should_create_alert = (
        rule_result["severity"] in ["HIGH", "CRITICAL"]
        or ml_prediction == 1
    )

    alert_id = None

    if should_create_alert:
        alert = FraudAlert(
            amount=transaction.amount,
            risk_score=rule_result["risk_score"],
            severity=rule_result["severity"],
            decision=rule_result["decision"],
            ml_probability=round(ml_probability, 4),
            status="NEW",
            reasons=rule_result["reasons"]
        )

        database.add(alert)
        database.commit()
        database.refresh(alert)

        alert_id = alert.id

    logged_events = []
    #Log a new-device event
    if transaction.new_device:
        log_security_event(
            database=database,
            event_type="NEW_DEVICE",
            severity="MEDIUM",
            description="Transaction performed from a new device.",
            event_data={
                "amount": transaction.amount
            }
        )

        logged_events.append("NEW_DEVICE")
    # Log failed login attempts
    if transaction.failed_logins_last_hour >= 3:
        log_security_event(
            database=database,
            event_type="FAILED_LOGIN",
            severity="HIGH",
            description="Repeated failed login attempts detected.",
            event_data={
                "failed_logins_last_hour":
                    transaction.failed_logins_last_hour
            }
        )

        logged_events.append("FAILED_LOGIN")
    # Log suspicious transactions
        if rule_result["severity"] in ["HIGH", "CRITICAL"]:
          log_security_event(
            database=database,
            event_type="SUSPICIOUS_TRANSACTION",
            severity=rule_result["severity"],
            description="High-risk transaction detected.",
            event_data={
                "amount": transaction.amount,
                "risk_score": rule_result["risk_score"],
                "reasons": rule_result["reasons"]
            }
        )

        logged_events.append("SUSPICIOUS_TRANSACTION")

    #Log alert creation
    if alert_id is not None:
        log_security_event(
            database=database,
            event_type="FRAUD_ALERT_CREATED",
            severity=rule_result["severity"],
            description="Fraud alert created for transaction.",
            event_data={
                "alert_id": alert_id,
                "risk_score": rule_result["risk_score"]
            }
        )

        logged_events.append("FRAUD_ALERT_CREATED")
    # This permanently saves the prepared events in PostgreSQL.
    if logged_events:
        database.commit()

    return {
        "risk_score": rule_result["risk_score"],
        "severity": rule_result["severity"],
        "decision": rule_result["decision"],
        "reasons": rule_result["reasons"],
        "ml_prediction": ml_prediction,
        "ml_probability": round(ml_probability, 4),
        "alert_created": should_create_alert,
        "alert_id": alert_id,
        "security_events_logged": logged_events
    }

@app.get("/alerts")
def get_alerts(
    severity: Literal[
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL"
    ] | None = None,
    status: Literal[
        "NEW",
        "INVESTIGATING",
        "RESOLVED",
        "FALSE_POSITIVE"
    ] | None = None,
    database: Session = Depends(get_database)
):
    query = database.query(FraudAlert)

    if severity is not None:
        query = query.filter(
            FraudAlert.severity == severity
        )

    if status is not None:
        query = query.filter(
            FraudAlert.status == status
        )

    alerts = (
        query
        .order_by(FraudAlert.created_at.desc())
        .all()
    )

    return [
        {
            "id": alert.id,
            "amount": alert.amount,
            "risk_score": alert.risk_score,
            "severity": alert.severity,
            "decision": alert.decision,
            "ml_probability": alert.ml_probability,
            "status": alert.status,
            "reasons": alert.reasons,
            "analyst_notes": alert.analyst_notes,
            "created_at": alert.created_at
        }
        for alert in alerts
    ]

@app.patch("/alerts/{alert_id}/status")
def update_alert_status(
    alert_id: int,
    update: AlertStatusUpdate,
    database: Session = Depends(get_database)
):
    alert = (
        database.query(FraudAlert)
        .filter(FraudAlert.id == alert_id)
        .first()
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Fraud alert not found"
        )
    old_status = alert.status
    alert.status = update.status

    log_audit_action(
        database=database,
        action="ALERT_STATUS_CHANGED",
        entity_type="FRAUD_ALERT",
        entity_id=alert.id,
        actor=update.actor,
        details={
            "old_status": old_status,
            "new_status": update.status
        }
    )

    database.commit()
    database.refresh(alert)

    return {
        "id": alert.id,
        "status": alert.status,
        "message": "Alert status updated successfully"
    }

@app.post("/alerts/{alert_id}/notes")
def add_analyst_note(
    alert_id: int,
    note_data: AnalystNoteCreate,
    database: Session = Depends(get_database)
):
    alert = (
        database.query(FraudAlert)
        .filter(FraudAlert.id == alert_id)
        .first()
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Fraud alert not found"
        )

    notes = list(alert.analyst_notes or [])

    notes.append({
        "note": note_data.note,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    alert.analyst_notes = notes

    log_audit_action(
    database=database,
    action="ANALYST_NOTE_ADDED",
    entity_type="FRAUD_ALERT",
    entity_id=alert.id,
    actor="Fraud Analyst",
    details={
        "note": note_data.note
    }
    )

    database.commit()
    database.refresh(alert)

    return {
        "id": alert.id,
        "analyst_notes": alert.analyst_notes,
        "message": "Analyst note added successfully"
    }

@app.post("/cases")
def create_investigation_case(
    case_data: InvestigationCaseCreate,
    database: Session = Depends(get_database)
):
    alert = (
        database.query(FraudAlert)
        .filter(FraudAlert.id == case_data.alert_id)
        .first()
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Fraud alert not found"
        )

    existing_case = (
        database.query(InvestigationCase)
        .filter(
            InvestigationCase.alert_id == case_data.alert_id
        )
        .first()
    )

    if existing_case is not None:
        raise HTTPException(
            status_code=409,
            detail="An investigation case already exists for this alert"
        )

    investigation_case = InvestigationCase(
        alert_id=case_data.alert_id,
        status="OPEN",
        assigned_analyst=case_data.assigned_analyst,
        summary=case_data.summary
    )

    database.add(investigation_case)

    # Ask PostgreSQL to generate the case ID before committing
    database.flush()

    log_audit_action(
    database=database,
    action="INVESTIGATION_CASE_CREATED",
    entity_type="INVESTIGATION_CASE",
    entity_id=investigation_case.id,
    actor=case_data.assigned_analyst or "Fraud Analyst",
    details={
        "alert_id": investigation_case.alert_id,
        "status": investigation_case.status,
        "summary": investigation_case.summary
    }
)

    database.commit()
    database.refresh(investigation_case)

    return {
        "id": investigation_case.id,
        "alert_id": investigation_case.alert_id,
        "status": investigation_case.status,
        "assigned_analyst": investigation_case.assigned_analyst,
        "summary": investigation_case.summary,
        "outcome": investigation_case.outcome,
        "created_at": investigation_case.created_at
    }

@app.get("/cases")
def get_investigation_cases(
    database: Session = Depends(get_database)
):
    cases = (
        database.query(InvestigationCase)
        .order_by(InvestigationCase.created_at.desc())
        .all()
    )

    return [
        {
            "id": investigation_case.id,
            "alert_id": investigation_case.alert_id,
            "status": investigation_case.status,
            "assigned_analyst": investigation_case.assigned_analyst,
            "summary": investigation_case.summary,
            "outcome": investigation_case.outcome,
            "created_at": investigation_case.created_at,
            "updated_at": investigation_case.updated_at
        }
        for investigation_case in cases
    ]

@app.patch("/cases/{case_id}/status")
def update_investigation_case_status(
    case_id: int,
    update: InvestigationCaseStatusUpdate,
    database: Session = Depends(get_database)
):
    investigation_case = (
        database.query(InvestigationCase)
        .filter(InvestigationCase.id == case_id)
        .first()
    )

    if investigation_case is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation case not found"
        )

    if update.status == "CLOSED" and update.outcome is None:
        raise HTTPException(
            status_code=400,
            detail="An outcome is required when closing a case"
        )

    if update.status != "CLOSED" and update.outcome is not None:
        raise HTTPException(
            status_code=400,
            detail="Outcome can only be set when closing a case"
        )

   # Save the previous values before changing them
    old_status = investigation_case.status
    old_outcome = investigation_case.outcome

    investigation_case.status = update.status
    investigation_case.outcome = update.outcome

    log_audit_action(
    database=database,
    action="INVESTIGATION_CASE_STATUS_CHANGED",
    entity_type="INVESTIGATION_CASE",
    entity_id=investigation_case.id,
    actor=update.actor,
    details={
        "old_status": old_status,
        "new_status": update.status,
        "old_outcome": old_outcome,
        "new_outcome": update.outcome
        }
    )
    event_severity = (
    "HIGH"
    if update.outcome == "CONFIRMED_FRAUD"
    else "MEDIUM"
)

    log_security_event(
    database=database,
    event_type="CASE_STATUS_CHANGED",
    severity=event_severity,
    description=(
        f"Investigation case {investigation_case.id} "
        f"changed from {old_status} to {update.status}"
    ),
    event_data={
        "case_id": investigation_case.id,
        "alert_id": investigation_case.alert_id,
        "old_status": old_status,
        "new_status": update.status,
        "outcome": update.outcome,
        "actor": update.actor
    }
    )

    database.commit()
    database.refresh(investigation_case)

    return {
        "id": investigation_case.id,
        "status": investigation_case.status,
        "outcome": investigation_case.outcome,
        "updated_at": investigation_case.updated_at,
        "message": "Investigation case updated successfully"
    }

@app.post("/security-events")
def create_security_event(
    event_data: SecurityEventCreate,
    database: Session = Depends(get_database)
):
    event = SecurityEvent(
        event_type=event_data.event_type,
        severity=event_data.severity,
        source=event_data.source,
        description=event_data.description,
        event_data=event_data.event_data
    )

    database.add(event)
    database.commit()
    database.refresh(event)

    return {
        "id": event.id,
        "event_type": event.event_type,
        "severity": event.severity,
        "source": event.source,
        "description": event.description,
        "event_data": event.event_data,
        "created_at": event.created_at
    }

@app.get("/security-events")
def get_security_events(
    database: Session = Depends(get_database)
):
    events = (
        database.query(SecurityEvent)
        .order_by(SecurityEvent.created_at.desc())
        .all()
    )

    return [
        {
            "id": event.id,
            "event_type": event.event_type,
            "severity": event.severity,
            "source": event.source,
            "description": event.description,
            "event_data": event.event_data,
            "created_at": event.created_at
        }
        for event in events
    ]

@app.get("/audit-logs")
def get_audit_logs(
    database: Session = Depends(get_database)
):
    logs = (
        database.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .all()
    )

    return [
        {
            "id": log.id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "actor": log.actor,
            "details": log.details,
            "created_at": log.created_at
        }
        for log in logs
    ]

@app.get("/analytics/summary")
def get_security_analytics(
    database: Session = Depends(get_database)
):
    total_alerts = database.query(
        func.count(FraudAlert.id)
    ).scalar()

    total_cases = database.query(
        func.count(InvestigationCase.id)
    ).scalar()

    total_security_events = database.query(
        func.count(SecurityEvent.id)
    ).scalar()

    open_cases = (
        database.query(func.count(InvestigationCase.id))
        .filter(InvestigationCase.status != "CLOSED")
        .scalar()
    )

    critical_alerts = (
        database.query(func.count(FraudAlert.id))
        .filter(FraudAlert.severity == "CRITICAL")
        .scalar()
    )

    confirmed_fraud_cases = (
        database.query(func.count(InvestigationCase.id))
        .filter(
            InvestigationCase.outcome == "CONFIRMED_FRAUD"
        )
        .scalar()
    )

    return {
        "total_alerts": total_alerts,
        "critical_alerts": critical_alerts,
        "total_cases": total_cases,
        "open_cases": open_cases,
        "confirmed_fraud_cases": confirmed_fraud_cases,
        "total_security_events": total_security_events
    }

@app.get("/analytics/risk-distribution")
def get_risk_distribution(
    database: Session = Depends(get_database)
):
    severity_counts = (
        database.query(
            FraudAlert.severity,
            func.count(FraudAlert.id)
        )
        .group_by(FraudAlert.severity)
        .all()
    )

    distribution = {
        "LOW": 0,
        "MEDIUM": 0,
        "HIGH": 0,
        "CRITICAL": 0
    }

    for severity, count in severity_counts:
        distribution[severity] = count

    return distribution

@app.get("/analytics/alerts-per-day")
def get_alerts_per_day(
    database: Session = Depends(get_database)
):
    daily_alerts = (
        database.query(
            func.date(FraudAlert.created_at).label("date"),
            func.count(FraudAlert.id).label("count")
        )
        .group_by(func.date(FraudAlert.created_at))
        .order_by(func.date(FraudAlert.created_at))
        .all()
    )

    return [
        {
            "date": alert_date.isoformat(),
            "count": count
        }
        for alert_date, count in daily_alerts
    ]

@app.get("/analytics/security-events-by-type")
def get_security_events_by_type(
    database: Session = Depends(get_database)
):
    event_counts = (
        database.query(
            SecurityEvent.event_type,
            func.count(SecurityEvent.id)
        )
        .group_by(SecurityEvent.event_type)
        .all()
    )

    distribution = {
        "FAILED_LOGIN": 0,
        "NEW_DEVICE": 0,
        "SUSPICIOUS_TRANSACTION": 0,
        "FRAUD_ALERT_CREATED": 0,
        "CASE_STATUS_CHANGED": 0
    }

    for event_type, count in event_counts:
        distribution[event_type] = count

    return distribution

@app.get("/analytics/cases-by-status")
def get_cases_by_status(
    database: Session = Depends(get_database)
):
    status_counts = (
        database.query(
            InvestigationCase.status,
            func.count(InvestigationCase.id)
        )
        .group_by(InvestigationCase.status)
        .all()
    )

    distribution = {
        "OPEN": 0,
        "IN_PROGRESS": 0,
        "CLOSED": 0
    }

    for status, count in status_counts:
        distribution[status] = count

    return distribution

@app.get("/analytics/model-performance")
def get_model_performance():
    return [
        {
            "model": "Logistic Regression",
            "accuracy": 1.0,
            "precision": 1.0,
            "recall": 1.0,
            "f1_score": 1.0
        },
        {
            "model": "Random Forest",
            "accuracy": 1.0,
            "precision": 1.0,
            "recall": 1.0,
            "f1_score": 1.0
        },
        {
            "model": "Isolation Forest",
            "accuracy": 0.965,
            "precision": 0.805556,
            "recall": 1.0,
            "f1_score": 0.892308
        }
    ]

@app.get("/reports/alerts.csv")
def download_alerts_csv(
    database: Session = Depends(get_database)
):
    alerts = (
        database.query(FraudAlert)
        .order_by(FraudAlert.created_at.desc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Alert ID",
        "Amount",
        "Risk Score",
        "Severity",
        "Decision",
        "ML Probability",
        "Status",
        "Created At"
    ])

    for alert in alerts:
        writer.writerow([
            alert.id,
            alert.amount,
            alert.risk_score,
            alert.severity,
            alert.decision,
            alert.ml_probability,
            alert.status,
            alert.created_at.isoformat()
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition":
                "attachment; filename=fraud_alerts_report.csv"
        }
    )

@app.get("/reports/security-report.pdf")
def download_security_pdf(
    database: Session = Depends(get_database)
):
    alerts = (
        database.query(FraudAlert)
        .order_by(FraudAlert.created_at.desc())
        .all()
    )

    total_alerts = len(alerts)

    critical_alerts = sum(
        1 for alert in alerts
        if alert.severity == "CRITICAL"
    )

    open_cases = (
        database.query(InvestigationCase)
        .filter(InvestigationCase.status != "CLOSED")
        .count()
    )

    confirmed_fraud = (
        database.query(InvestigationCase)
        .filter(
            InvestigationCase.outcome == "CONFIRMED_FRAUD"
        )
        .count()
    )

    buffer = io.BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch
    )

    styles = getSampleStyleSheet()
    elements = []

    elements.append(
        Paragraph(
            "Bank Fraud Detection Security Report",
            styles["Title"]
        )
    )

    elements.append(
        Paragraph(
            f"Generated at: "
            f"{datetime.now(timezone.utc).isoformat()}",
            styles["Normal"]
        )
    )

    elements.append(Spacer(1, 20))

    summary_data = [
        ["Metric", "Value"],
        ["Total fraud alerts", total_alerts],
        ["Critical alerts", critical_alerts],
        ["Open investigation cases", open_cases],
        ["Confirmed fraud cases", confirmed_fraud]
    ]

    summary_table = Table(
        summary_data,
        colWidths=[3 * inch, 1.5 * inch]
    )

    summary_table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (-1, 0),
                colors.darkblue
            ),
            (
                "TEXTCOLOR",
                (0, 0),
                (-1, 0),
                colors.white
            ),
            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.5,
                colors.grey
            ),
            (
                "FONTNAME",
                (0, 0),
                (-1, 0),
                "Helvetica-Bold"
            ),
            (
                "PADDING",
                (0, 0),
                (-1, -1),
                8
            )
        ])
    )

    elements.append(summary_table)
    elements.append(Spacer(1, 25))

    elements.append(
        Paragraph(
            "Fraud Alerts",
            styles["Heading2"]
        )
    )

    alert_data = [[
        "ID",
        "Amount",
        "Risk",
        "Severity",
        "Decision",
        "Status",
        "Created At"
    ]]

    for alert in alerts:
        alert_data.append([
            alert.id,
            alert.amount,
            alert.risk_score,
            alert.severity,
            alert.decision,
            alert.status,
            alert.created_at.strftime(
                "%Y-%m-%d %H:%M"
            )
        ])

    alerts_table = Table(
        alert_data,
        repeatRows=1,
        colWidths=[
            0.5 * inch,
            1.1 * inch,
            0.7 * inch,
            1.1 * inch,
            1.1 * inch,
            1.3 * inch,
            1.8 * inch
        ]
    )

    alerts_table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (-1, 0),
                colors.darkblue
            ),
            (
                "TEXTCOLOR",
                (0, 0),
                (-1, 0),
                colors.white
            ),
            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.5,
                colors.grey
            ),
            (
                "FONTNAME",
                (0, 0),
                (-1, 0),
                "Helvetica-Bold"
            ),
            (
                "FONTSIZE",
                (0, 0),
                (-1, -1),
                9
            ),
            (
                "PADDING",
                (0, 0),
                (-1, -1),
                6
            )
        ])
    )

    elements.append(alerts_table)

    document.build(elements)

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                "attachment; filename=security_report.pdf"
        }
    )