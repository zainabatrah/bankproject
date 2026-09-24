# BankShield Render + Neon Deployment

This is a portfolio/demo deployment, not a real banking production system.

## Services

- Neon free PostgreSQL: one project/database for the demo.
- Render web service: `zainabatrah-bankshield-backend`
- Render Docker web service: `zainabatrah-bankshield-fraud-service`
- Render static site: `zainabatrah-bankshield-frontend`
- Render static site: `zainabatrah-bankshield-soc`

## Render Blueprint

The root `render.yaml` defines the four Render services. It does not include secret values.

If Render cannot allocate one of the requested service names, update these non-secret URL variables to the final Render URLs:

- backend `FRAUD_ENGINE_URL`
- backend `CORS_ORIGINS`
- frontend `VITE_API_URL`
- SOC dashboard `VITE_API_URL`
- SOC dashboard `VITE_SOC_API_URL`

## Required Provider Environment Variables

Set these in Render only. Do not commit them.

Backend:

- `DATABASE_URL`: Neon PostgreSQL connection string for the BankShield database.
- `JWT_SECRET`: new random production secret, at least 32 characters.
- `MFA_ENCRYPTION_KEY`: new random 64-character hexadecimal value.
- `FRAUD_API_KEY`: new random shared key. Must match the fraud service value.
- `FRAUD_ENGINE_URL`: fraud service Render URL.
- `NODE_ENV`: `production`
- `CORS_ORIGINS`: comma-separated frontend and SOC dashboard origins.

Fraud service:

- `DATABASE_URL`: Neon PostgreSQL connection string for the fraud service tables.
- `FRAUD_API_KEY`: same value as backend `FRAUD_API_KEY`.

Frontend:

- `VITE_API_URL`: backend Render URL.

SOC dashboard:

- `VITE_API_URL`: backend Render URL.
- `VITE_SOC_API_URL`: backend Render URL with `/soc`.

## Safe Secret Generation

Generate values locally and paste them directly into Render without committing or printing them in terminal output.

PowerShell examples:

```powershell
node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" | Set-Clipboard
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" | Set-Clipboard
```

Use the first command for `JWT_SECRET`, the second for `MFA_ENCRYPTION_KEY`, and the third for `FRAUD_API_KEY`.

## Deploy Order

1. Create the Neon database.
2. Copy the Neon connection string.
3. In Render, create a Blueprint from this repository and branch `main`.
4. Enter the `sync: false` values when Render prompts for them.
5. Deploy the fraud service and backend.
6. Deploy or redeploy both static sites after the backend URL is final.
7. Confirm:
   - backend `/health`
   - fraud service `/`
   - banking frontend loads and can register/login
   - SOC dashboard can authenticate with an allowed SOC role
