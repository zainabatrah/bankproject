from typing import List

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(
    title="BankShield Fraud Detection Engine",
    version="1.0.0",
)


class TransactionRequest(BaseModel):
    transaction_id: str
    user_id: int

    amount: float = Field(gt=0)

    new_device: bool = False
    new_beneficiary: bool = False

    transactions_last_hour: int = Field(
        default=0,
        ge=0,
    )

    transaction_hour: int = Field(
        ge=0,
        le=23,
    )


class FraudAnalysisResponse(BaseModel):
    risk_score: int
    risk_level: str
    flagged: bool
    reasons: List[str]


def calculate_risk(
    transaction: TransactionRequest,
):
    score = 0
    reasons = []

    # Rule 1: Large transaction
    if transaction.amount >= 5000:
        score += 30
        reasons.append(
            "Large transaction amount"
        )

    # Rule 2: New device
    if transaction.new_device:
        score += 20
        reasons.append(
            "Transaction from new device"
        )

    # Rule 3: New beneficiary
    if transaction.new_beneficiary:
        score += 15
        reasons.append(
            "New beneficiary"
        )

    # Rule 4: Many transactions
    if transaction.transactions_last_hour >= 5:
        score += 25
        reasons.append(
            "High transaction frequency"
        )

    # Rule 5: Unusual hour
    if 0 <= transaction.transaction_hour <= 5:
        score += 10
        reasons.append(
            "Transaction at unusual hour"
        )

    score = min(score, 100)

    if score < 30:
        risk_level = "LOW"

    elif score < 60:
        risk_level = "MEDIUM"

    elif score < 80:
        risk_level = "HIGH"

    else:
        risk_level = "CRITICAL"

    flagged = score >= 60

    return {
        "risk_score": score,
        "risk_level": risk_level,
        "flagged": flagged,
        "reasons": reasons,
    }


@app.get("/")
def root():
    return {
        "service": "BankShield Fraud Detection Engine",
        "status": "running",
    }


@app.post(
    "/analyze-transaction",
    response_model=FraudAnalysisResponse,
)
def analyze_transaction(
    transaction: TransactionRequest,
):
    return calculate_risk(transaction)