# BankShield Final Demo Guide

Use this as the presentation runbook for Task 49.

## Pre-demo checklist

1. Confirm PostgreSQL is running and `backend\.env` points to the demo database.
2. Confirm secrets in `backend\.env` are not placeholders.
3. Run migrations:

   ```powershell
   cd backend
   npx prisma migrate deploy
   npx prisma generate
   ```

4. Run verification:

   ```powershell
   npm test -- --runInBand
   npm run test:e2e -- --runInBand
   npm run build
   npm audit --audit-level=high
   ```

5. Build the frontend apps:

   ```powershell
   cd ..\frontend
   npm run build

   cd ..\security-dashboard
   npm run build
   ```

## Start services

Open four terminals.

### 1. Fraud service

```powershell
cd backend\fraud-service
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

### 2. Backend API

```powershell
cd backend
npm run start:dev
```

Check:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

### 3. Banking frontend

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`.

### 4. Security dashboard

```powershell
cd security-dashboard
npm run dev -- --port 5174
```

Open `http://localhost:5174`.

## Recommended demo story

### 1. Platform health and hardening

- Show `GET /health` returning API and database status.
- Mention no secrets are exposed.
- Mention request IDs, global safe error handling, validation, CORS, payload limits, security headers, and rate limiting.

### 2. Authentication workflow

- Register or sign in as a customer.
- Show session/device tracking.
- Demonstrate MFA setup or explain the MFA flow if time is short.
- Mention password changes and logout revoke tokens/sessions.

### 3. Banking workflow

- Show customer accounts and beneficiaries.
- Create a normal transfer.
- Refresh transaction history and account balances.
- Explain idempotency: repeating the same `X-Idempotency-Key` returns the same transaction instead of moving money twice.
- Mention transfer limits reject oversized or excessive daily transfers.

### 4. Fraud workflow

- Submit a risky transfer or use existing fraud alert data.
- Show the flagged transfer does not move money.
- Show the resulting fraud alert.
- Explain fraud-service outage handling: transfer is rejected, balances remain unchanged, security event and audit log are recorded.

### 5. Investigation workflow

- Open the SOC/security dashboard.
- Show fraud alerts and risk distribution.
- Move an alert into investigation.
- Create or view an investigation case.
- Add a note and resolve the case.

### 6. Security and audit workflow

- Show security events filtering.
- Show audit log filtering.
- Point out audit logs are append-only: search/view exists, edit/delete routes do not.
- Show RBAC by using a lower-privilege account if available, or explain the e2e role matrix verifies access boundaries.

### 7. Reversal workflow

- Reverse a completed transfer.
- Show balances returning to their prior values.
- Attempt a second reversal and show it is rejected.

## Demo roles to prepare

Prepare at least:

- Customer account for banking flows.
- Security analyst or admin account for dashboard, security events, and audit logs.
- Fraud analyst account if demonstrating fraud-alert-only access.

## Fallback plan

If the fraud service is unavailable during the demo, use it as the failure-handling demonstration:

- The backend returns a safe `503`.
- A rejected transaction is recorded.
- A `FRAUD_SERVICE_UNAVAILABLE` security event is created.
- An audit log entry is written.
- Money is not moved.

If the dashboard cannot read a token, sign in through the main frontend first. The dashboard reads the local `bankshield.auth.session.v1` session. `VITE_SOC_ACCESS_TOKEN` can be used only for local debugging.
