# BankShield frontend

Responsive React/TypeScript client for the BankShield banking and fraud-protection platform.

## Included experiences

- Registration, password sign-in, MFA challenge, and recovery-code sign-in
- Customer dashboard, multi-currency accounts, beneficiaries, transfers, and transaction history
- MFA setup/disable/recovery-code management and recognized-device status
- Role-gated fraud operations, alert triage, user administration, and audit logs
- Explicit customer, analyst, and administrator demo workspaces for UI review without running the APIs

## Run locally

```powershell
npm install
npm run dev
```

The app runs at `http://localhost:5173`, which matches the current NestJS CORS configuration.

By default, API requests target `http://localhost:3000`. Override that with a local `.env` file when needed:

```env
VITE_API_URL=http://localhost:3000
```

For real transfers, run both the NestJS backend and the root fraud-analysis service. The interactive demo on the sign-in screen remains fully usable when those services or PostgreSQL are unavailable.

## Validation

```powershell
npm run lint
npm run build
```

## Session note

The current backend returns access and refresh tokens in JSON and accepts refresh tokens in request bodies, so the client stores the session in browser storage to match that contract. A production deployment should move refresh tokens to secure, `HttpOnly`, same-site cookies when the backend supports them.
