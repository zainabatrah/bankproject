from fastapi import FastAPI
from pydantic import BaseModel
from pydantic import BaseModel, Field


# Create the FastAPI application
app = FastAPI(title="Bank Fraud Detection API")


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


# Simple endpoint to check whether the API is running
@app.get("/")
def home():
    return {"message": "Bank Fraud Detection API is running"}


# Endpoint that analyzes a transaction
@app.post("/analyze")
def analyze(transaction: Transaction):
    return analyze_transaction(transaction)