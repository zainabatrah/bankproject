
# BankShield Final Demo Guide

Use this runbook for the final BankShield presentation.

## Pre-demo checklist

1. Start Docker Desktop.
2. Confirm `.env.docker` exists and contains non-placeholder local secrets.
3. Never display or commit `.env.docker`.
4. Validate the Compose configuration:

   ```powershell
   docker compose --env-file .env.docker config --quiet


```

5. Start all services:

   ```powershell
   docker compose --env-file .env.docker up -d --build
   ```

6. Confirm all containers are running:

   ```powershell
   docker compose --env-file .env.docker ps
   ```

7. Check both APIs:

   ```powershell
   Invoke-WebRequest -UseBasicParsing http://localhost:3000/health |
     Select-Object StatusCode, Content

   Invoke-WebRequest -UseBasicParsing http://localhost:8000/ |
     Select-Object StatusCode, Content
   ```

## Service URLs

| Service | URL |
|---|---|
| Banking frontend | http://localhost:5173 |
| Security dashboard | http://localhost:5174 |
| NestJS backend | http://localhost:3000 |
| FastAPI fraud service | http://localhost:8000 |

The banking frontend and security dashboard have separate login sessions.

## Demo accounts

Prepare:

- One active CUSTOMER account for banking operations.
- One active SECURITY_ANALYST account for the SOC dashboard.
- Optionally, one FRAUD_ANALYST or ADMIN account.

Never include account passwords in this document or in Git.

## Recommended demo story

### 1. Platform health

- Show the Docker containers running.
- Show `GET /health` returning healthy API and database states.
- Mention request IDs, validation, CORS, payload limits, rate limiting, and security headers.

### 2. Authentication and authorization

- Sign in to the banking frontend as a customer.
- Show the customer profile and account.
- Explain device tracking, MFA, refresh-token rotation, and logout revocation.
- Explain that CUSTOMER users cannot access SOC endpoints.
- Sign in independently at `http://localhost:5174` as a SECURITY_ANALYST.

### 3. Normal transfer

- Open the customer’s accounts and beneficiaries.
- Submit a low-risk transfer.
- Show the completed transaction and updated balances.
- Explain that `X-Idempotency-Key` prevents duplicate money movement.
- Mention per-transfer and daily limits.

### 4. Fraud detection

- Use an existing HIGH-risk fraud alert or generate a controlled risky transfer.
- Show the risk score, risk level, and detection reasons.
- Show that a flagged transfer does not move money.
- Show the resulting fraud alert in the security dashboard.

A reproducible risky scenario can include:

- A new device
- A beneficiary created within 24 hours
- Three recent failed login attempts

### 5. Investigation workflow

- Open the fraud alert in the security dashboard.
- Change its status to `INVESTIGATING`.
- Create or open the linked investigation case.
- Add an analyst note if available.
- Resolve the case.
- Show the dashboard totals updating.

### 6. Security events and audit trail

- Show failed-login security events.
- Show audit records for `LOGIN_FAILED`, `TRANSFER_FLAGGED`, alert status changes, and investigation changes.
- Explain that audit logs are append-only.

### 7. Reversal workflow

- Select a completed transaction.
- Reverse it using an authorized employee or admin workflow.
- Show the balances returning to their previous values.
- Attempt a second reversal and show that it is rejected.

### 8. Security evidence

Mention the verified controls:

- Protected endpoints return `401` without authentication.
- CUSTOMER access to SOC endpoints returns `403`.
- FastAPI rejects missing or invalid API keys.
- Revoked refresh tokens cannot be reused.
- HTTP security and rate-limit headers are enabled.
- GitHub Actions checks all four applications.

## Fallback plan

If the FastAPI service becomes unavailable:

- The backend returns a safe `503`.
- A rejected transaction is recorded.
- A `FRAUD_SERVICE_UNAVAILABLE` security event is created.
- An audit record is written.
- Account balances remain unchanged.

If a session expires, sign in again through the affected application.

Useful diagnostics:

```powershell
docker compose --env-file .env.docker ps -a
docker compose --env-file .env.docker logs backend --tail 100
docker compose --env-file .env.docker logs fraud-service --tail 100
```

## Supporting evidence

See `docs/integration-security-testing.md` for the completed integration and security test results.