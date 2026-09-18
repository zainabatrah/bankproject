# BankShield Security Dashboard

React/Vite security operations dashboard for BankShield.

## Run locally

```powershell
npm install
npm run dev -- --port 5174
```

Open `http://localhost:5174`.

## Backend integration

Create a local `.env` from `.env.example`:

```env
VITE_API_URL=http://localhost:3000
VITE_SOC_API_URL=
VITE_SOC_ACCESS_TOKEN=
```

The dashboard uses the real NestJS backend APIs:

- `/fraud-alerts` for alert queues and status updates
- `/security-events` for security events
- `/audit-logs` for audit history
- `/soc/cases` and `/soc/analytics/*` for investigation cases and SOC metrics

For local development, sign in through the main BankShield frontend first; the dashboard reads the stored `bankshield.auth.session.v1` access token. `VITE_SOC_ACCESS_TOKEN` is only a local debugging escape hatch and must not contain a committed real token.

## Demo path

1. Start the fraud service and NestJS backend.
2. Sign in through the main frontend as a security analyst or admin.
3. Open this dashboard and confirm alerts, cases, security events, and audit logs load from the backend.
4. Triage a fraud alert, create or update an investigation case, and review security/audit activity.

## Validation

```powershell
npm run build
npm audit --audit-level=high
```
