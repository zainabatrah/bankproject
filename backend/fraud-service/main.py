from datetime import datetime, timezone
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal
from db_models import FraudAlert

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

class AnalystNoteCreate(BaseModel):
    note: str = Field(min_length=1, max_length=1000)

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

    return {
        "risk_score": rule_result["risk_score"],
        "severity": rule_result["severity"],
        "decision": rule_result["decision"],
        "reasons": rule_result["reasons"],
        "ml_prediction": ml_prediction,
        "ml_probability": round(ml_probability, 4),
        "alert_created": should_create_alert,
        "alert_id": alert_id
    }

@app.get("/alerts")
def get_alerts(database: Session = Depends(get_database)):
    alerts = (
        database.query(FraudAlert)
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

    alert.status = update.status

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

    database.commit()
    database.refresh(alert)

    return {
        "id": alert.id,
        "analyst_notes": alert.analyst_notes,
        "message": "Analyst note added successfully"
    }