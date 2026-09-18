# BankShield

BankShield is a banking and fraud-protection demo platform with a NestJS API, PostgreSQL/Prisma persistence, a React banking frontend, a React SOC dashboard, and a Python fraud-analysis service.

## What is included

- Authentication: registration, login, refresh tokens, logout, device/session management, password reset, MFA setup and recovery codes.
- Banking: customer accounts, beneficiaries, transfers, transaction history, transfer idempotency, transfer limits, and transaction reversal.
- Fraud operations: fraud scoring integration, blocked/rejected transfers, fraud alerts, investigation cases, SOC analytics, security events, and audit logs.
- Security hardening: RBAC, ownership checks, validation, rate limiting, security headers, CORS, payload limits, request IDs, centralized safe errors, health checks, and environment validation.

## Project layout

```text
backend/                 NestJS API, Prisma schema, backend tests
backend/fraud-service/   Python FastAPI fraud-analysis service
frontend/                Main customer/operations React app
security-dashboard/      SOC/security dashboard React app
docs/                    API contract, demo guide, final audit notes
```

## Local prerequisites

- Node.js and npm
- Python 3.11+
- PostgreSQL

## Configure the services

Create local environment files from the examples:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
Copy-Item security-dashboard\.env.example security-dashboard\.env
Copy-Item backend\fraud-service\.env.example backend\fraud-service\.env
```

Update `backend\.env` with a valid `DATABASE_URL`, unique `JWT_SECRET`, and 64-character hex `MFA_ENCRYPTION_KEY`.

## Install and prepare

```powershell
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
```

For frontend apps:

```powershell
cd frontend
npm install

cd ..\security-dashboard
npm install
```

For the fraud service:

```powershell
cd backend\fraud-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run locally

Use separate terminals:

```powershell
cd backend\fraud-service
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

```powershell
cd backend
npm run start:dev
```

```powershell
cd frontend
npm run dev
```

```powershell
cd security-dashboard
npm run dev -- --port 5174
```

Default local URLs:

- Backend API: `http://localhost:3000`
- Fraud service: `http://localhost:8000`
- Banking frontend: `http://localhost:5173`
- SOC dashboard: `http://localhost:5174`

## Verification

```powershell
cd backend
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm audit --audit-level=high
```

```powershell
cd frontend
npm run build
npm audit --audit-level=high
```

```powershell
cd security-dashboard
npm run build
npm audit --audit-level=high
```

## Demo

Use [docs/demo-guide.md](docs/demo-guide.md) as the final presentation runbook. It includes the recommended service order, account setup, workflow sequence, and fallback plan.

## Security notes

- Never commit real `.env` files, tokens, passwords, MFA keys, or database credentials.
- Production must use unique secrets, explicit CORS origins, non-local service URLs, HTTPS, and secure secret management.
- The dashboard reads the access token saved by the main frontend during local development. `VITE_SOC_ACCESS_TOKEN` is only a local debugging escape hatch.
