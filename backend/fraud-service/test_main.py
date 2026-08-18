from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


def test_normal_transaction():
    response = client.post(
        "/analyze",
        json={
            "amount": 300,
            "average_amount": 250,
            "new_device": False,
            "new_beneficiary": False,
            "transactions_last_hour": 1,
            "failed_logins_last_hour": 0,
            "transaction_hour": 14
        }
    )

    assert response.status_code == 200
    assert response.json()["risk_score"] == 0
    assert response.json()["severity"] == "LOW"
    assert response.json()["decision"] == "APPROVE"


def test_suspicious_transaction():
    response = client.post(
        "/analyze",
        json={
            "amount": 7500,
            "average_amount": 250,
            "new_device": True,
            "new_beneficiary": True,
            "transactions_last_hour": 8,
            "failed_logins_last_hour": 4,
            "transaction_hour": 2
        }
    )

    assert response.status_code == 200
    assert response.json()["risk_score"] == 100
    assert response.json()["severity"] == "CRITICAL"
    assert response.json()["decision"] == "BLOCK"


def test_invalid_transaction():
    response = client.post(
        "/analyze",
        json={
            "amount": -500,
            "average_amount": 250,
            "new_device": False,
            "new_beneficiary": False,
            "transactions_last_hour": 1,
            "failed_logins_last_hour": 0,
            "transaction_hour": 30
        }
    )

    assert response.status_code == 422


def test_ml_fraud_prediction():
    response = client.post(
        "/predict",
        json={
            "amount": 7500,
            "average_amount": 250,
            "new_device": True,
            "new_beneficiary": True,
            "transactions_last_hour": 8,
            "failed_logins_last_hour": 4,
            "transaction_hour": 2
        }
    )

    result = response.json()

    assert response.status_code == 200
    assert result["prediction"] == 1
    assert result["is_fraud"] is True
    assert 0 <= result["fraud_probability"] <= 1

def test_security_analytics_summary():
    response = client.get("/analytics/summary")

    assert response.status_code == 200

    result = response.json()

    assert "total_alerts" in result
    assert "critical_alerts" in result
    assert "total_cases" in result
    assert "open_cases" in result
    assert "confirmed_fraud_cases" in result
    assert "total_security_events" in result


def test_risk_distribution():
    response = client.get(
        "/analytics/risk-distribution"
    )

    assert response.status_code == 200

    result = response.json()

    assert "LOW" in result
    assert "MEDIUM" in result
    assert "HIGH" in result
    assert "CRITICAL" in result


def test_csv_alert_report():
    response = client.get("/reports/alerts.csv")

    assert response.status_code == 200

    assert response.headers[
        "content-type"
    ].startswith("text/csv")

    assert "Alert ID" in response.text
    assert "Risk Score" in response.text


def test_pdf_security_report():
    response = client.get(
        "/reports/security-report.pdf"
    )

    assert response.status_code == 200

    assert response.headers[
        "content-type"
    ].startswith("application/pdf")

    assert response.content.startswith(b"%PDF")