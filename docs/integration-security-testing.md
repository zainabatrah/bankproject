# Integration and Security Testing Report

Test date: September 21, 2026
Environment: Local Docker Compose

## Services

| Service | URL | Result |
|---|---|---|
| NestJS backend | http://localhost:3000 | PASS |
| FastAPI fraud service | http://localhost:8000 | PASS |
| Banking frontend | http://localhost:5173 | PASS |
| Security dashboard | http://localhost:5174 | PASS |
| PostgreSQL | Docker internal / host port 5433 | PASS |

## Test Results

| Test | Expected result | Actual result |
|---|---|---|
| Backend health | HTTP 200 with API and database healthy | PASS |
| Fraud-service health | HTTP 200 | PASS |
| Protected endpoints without token | HTTP 401 | PASS |
| FastAPI request without API key | HTTP 401 | PASS |
| FastAPI request with incorrect API key | HTTP 401 | PASS |
| FastAPI request with correct API key | Fraud analysis returned | PASS |
| Customer authentication | Active CUSTOMER session | PASS |
| Customer access to SOC API | HTTP 403 | PASS |
| Security analyst authentication | Active SECURITY_ANALYST session | PASS |
| Analyst access to SOC API | HTTP 200 | PASS |
| Failed-login detection | Three failed attempts recorded | PASS |
| Suspicious transfer analysis | Score 60, HIGH, FLAGGED | PASS |
| Flagged transfer balance protection | No balance movement | PASS |
| Fraud alert creation | OPEN alert created | PASS |
| Security dashboard alert display | Alert visible to analyst | PASS |
| Investigation creation | Case linked to alert | PASS |
| Investigation status update | INVESTIGATING to RESOLVED | PASS |
| Audit logging | Full incident lifecycle recorded | PASS |
| Refresh-token revocation | Revoked token rejected with HTTP 401 | PASS |
| HTTP security headers | CSP, HSTS, nosniff, frame and referrer protections present | PASS |
| Rate-limit headers | Limit and remaining-request headers present | PASS |

## Fraud Scenario Evidence

The test transaction produced:

- Transaction ID: 2
- Amount: USD 500
- Status: FLAGGED
- Risk score: 60
- Risk level: HIGH
- Fraud alert ID: 1
- Investigation case ID: 1

Detection reasons:

- Transaction made from a new device
- Transaction sent to a new beneficiary
- Repeated failed login attempts

The sender and receiver balances remained unchanged after the transaction was flagged.

## Authorization Evidence

- Unauthenticated requests to protected NestJS endpoints returned HTTP 401.
- A CUSTOMER account was denied access to `/soc/summary` with HTTP 403.
- A SECURITY_ANALYST account accessed `/soc/summary` successfully.
- Missing and incorrect FastAPI API keys returned HTTP 401.

## Audit Evidence

The audit log recorded:

- LOGIN_FAILED
- TRANSFER_FLAGGED
- FRAUD_ALERT_STATUS_CHANGED
- INVESTIGATION_CASE_CREATED
- INVESTIGATION_CASE_STATUS_CHANGED

## Conclusion

The BankShield services successfully completed end-to-end integration and security testing. Authentication, authorization, fraud analysis, transaction blocking, SOC investigation, audit logging, token revocation, and HTTP response protections behaved as expected.
