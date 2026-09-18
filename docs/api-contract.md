# BankShield API Contract

This document captures the integration contract used by the BankShield frontend, SOC dashboard, NestJS backend, and Python fraud service.

## Services

```text
Banking frontend      -> NestJS backend
Security dashboard   -> NestJS backend
NestJS backend       -> PostgreSQL
NestJS backend       -> Python fraud service
```

Default local URLs:

- NestJS backend: `http://localhost:3000`
- Python fraud service: `http://localhost:8000`
- Banking frontend: `http://localhost:5173`
- Security dashboard: `http://localhost:5174`

## Authentication

Most protected endpoints use:

```http
Authorization: Bearer <access-token>
```

Transfer creation also requires:

```http
X-Device-ID: <stable-device-id>
X-Idempotency-Key: <optional-client-generated-key>
```

## Key backend endpoints

### Health

```http
GET /health
```

Public endpoint returning API and database health without secrets.

### Authentication

```http
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/change-password
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/mfa/setup
POST /auth/mfa/verify-setup
POST /auth/mfa/login-verify
GET  /auth/me
GET  /auth/sessions
DELETE /auth/sessions/:id
POST /auth/sessions/logout-all
```

### Banking

```http
GET  /accounts/me
GET  /beneficiaries
POST /beneficiaries
POST /transactions/transfer
GET  /transactions/me
POST /transactions/:id/reverse
```

Transfer outcomes:

- `COMPLETED`: money moved.
- `FLAGGED`: no money moved; fraud alert created.
- `REJECTED`: no money moved; used for fraud-service failure handling.
- `REVERSED`: completed transfer was reversed.

### Fraud alerts and SOC

```http
GET   /fraud-alerts
GET   /fraud-alerts/:id
GET   /fraud-alerts/summary
PATCH /fraud-alerts/:id/status

GET   /soc/summary
GET   /soc/alerts
PATCH /soc/alerts/:id/status
POST  /soc/alerts/:id/notes
GET   /soc/cases
POST  /soc/cases
PATCH /soc/cases/:id/status
GET   /soc/analytics/risk-distribution
GET   /soc/analytics/alerts-per-day
GET   /soc/analytics/cases-by-status
GET   /soc/analytics/security-events-by-type
GET   /soc/reports/alerts.csv
GET   /soc/reports/security-report.json
```

### Security events and audit logs

```http
GET /security-events
GET /security-events/:id
GET /security-events/summary
GET /security-events/types

GET /audit-logs
GET /audit-logs/:id
GET /audit-logs/summary
```

Security events and audit logs support pagination and filtering. There are no edit or delete endpoints for audit logs.

## Fraud service contract

The NestJS backend calls the fraud service before creating a transfer result.

### Request

```http
POST /analyze-transaction
Content-Type: application/json
```

```json
{
  "transaction_id": "TX-uuid",
  "user_id": 15,
  "amount": 2500,
  "new_device": true,
  "new_beneficiary": false,
  "transactions_last_hour": 3,
  "transaction_hour": 14
}
```

### Response

```json
{
  "risk_score": 72,
  "risk_level": "HIGH",
  "flagged": true,
  "reasons": ["Unusual transaction amount", "New device"]
}
```

`risk_level` must be one of `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.

When the fraud service is unavailable, the backend records a `REJECTED` transaction, emits a `FRAUD_SERVICE_UNAVAILABLE` security event, writes an audit log entry, and returns a safe `503` response.
