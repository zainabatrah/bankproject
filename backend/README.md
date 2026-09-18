# BankShield Backend

NestJS API for BankShield banking, fraud operations, security monitoring, and audit logging.

## Main capabilities

- Auth: register, login, refresh, logout, password change/reset, MFA setup/verify/disable, trusted devices, and session revocation.
- Banking: accounts, beneficiaries, transfers, idempotent transfer replay, transfer limits, transaction history, and reversals.
- Fraud/SOC: fraud-engine scoring, fraud alerts, investigation cases, SOC analytics, security events, and audit logs.
- Security: RBAC, ownership checks, validation pipe, request IDs, centralized safe error responses, structured request/error logs, rate limiting, CORS, Helmet headers, payload limits, health checks, and startup configuration validation.

## Environment

Copy `.env.example` to `.env` and replace all placeholders:

```powershell
Copy-Item .env.example .env
```

Required values:

- `DATABASE_URL`
- `JWT_SECRET` with at least 32 characters
- `MFA_ENCRYPTION_KEY` as exactly 64 hex characters
- `FRAUD_ENGINE_URL`
- `NODE_ENV`
- `PORT`
- `CORS_ORIGINS`

Production startup intentionally rejects weak/example secrets, missing explicit CORS origins, and localhost database/fraud-service URLs.

## Database

```powershell
npm install
npx prisma migrate deploy
npx prisma generate
```

For local schema iteration, use Prisma migration commands appropriate to your development workflow.

## Run

```powershell
npm run start:dev
```

The API defaults to `http://localhost:3000`.

Useful endpoints:

- `GET /health` public API/database health check.
- `POST /auth/register`
- `POST /auth/login`
- `POST /transactions/transfer`
- `POST /transactions/:id/reverse`
- `GET /fraud-alerts`
- `GET /security-events`
- `GET /audit-logs`
- `GET /soc/summary`

Protected fraud/security endpoints require roles such as `FRAUD_ANALYST`, `SECURITY_ANALYST`, or `ADMIN`; direct security-event and audit-log APIs are restricted to `SECURITY_ANALYST` and `ADMIN`.

## Test and audit

```powershell
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm audit --audit-level=high
```

The e2e suite exercises authentication, session revocation, banking transfers, idempotency, transfer limits, fraud alerts, rejected transfers, reversals, SOC workflows, security events, audit logs, health checks, validation, and safe errors.

## Dependency notes

The backend uses npm `overrides` for patched transitive versions of packages pulled through framework tooling. Keep those overrides unless the upstream Nest/Prisma dependency ranges are upgraded and audit remains clean.
