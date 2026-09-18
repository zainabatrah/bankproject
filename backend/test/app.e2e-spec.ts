import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app-setup';
import { FraudService } from './../src/fraud/fraud.service';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(60_000);

interface ErrorResponseBody {
  requestId: string;
  message: string | string[];
  token?: unknown;
}

interface RegistrationResponseBody {
  id: number;
  email: string;
  role: string;
  status: string;
  passwordHash?: unknown;
}

interface LoginResponseBody {
  accessToken?: string;
  refreshToken?: string;
  user?: { id: number; email: string };
  mfaRequired?: boolean;
  mfaToken?: string;
}

interface DeviceResponseBody {
  id: number;
  deviceId: string;
  trusted: boolean;
}

interface SessionResponseBody {
  id: number;
  deviceId: string;
}

interface SummaryResponseBody {
  total_alerts: number;
  critical_alerts: number;
  open_cases: number;
  total_security_events: number;
}

interface AlertResponseBody {
  id: number;
  risk_score: number;
  severity: string;
  status: string;
}

interface CaseResponseBody {
  id: number;
  alert_id: number;
  status: string;
}

interface StatusResponseBody {
  alert?: AlertResponseBody;
  case?: CaseResponseBody;
}

interface MfaSetupResponseBody {
  manualEntryKey: string;
  qrCodeDataUrl: string;
}

interface MfaVerifyResponseBody {
  mfaEnabled: boolean;
  recoveryCodes: string[];
}

interface SecurityReportResponseBody {
  summary: SummaryResponseBody;
  risk_distribution: Record<string, number>;
  cases_by_status: Record<string, number>;
}

function bodyOf<T>(response: { body: unknown }): T {
  return response.body as T;
}

describe('BankShield security flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fraudService: FraudService;
  let customerId: number | undefined;
  let receiverId: number | undefined;
  let analystId: number | undefined;
  let fraudAnalystId: number | undefined;
  let bankEmployeeId: number | undefined;
  let adminId: number | undefined;
  let senderAccountId: number | undefined;
  let receiverAccountId: number | undefined;
  let beneficiaryId: number | undefined;
  let completedTransferId: number | undefined;
  let flaggedTransferId: number | undefined;
  let flaggedFraudAlertId: number | undefined;
  let rejectedTransferId: number | undefined;
  let transactionId: number | undefined;
  let fraudAlertId: number | undefined;
  let investigationCaseId: number | undefined;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customerEmail = `e2e-customer-${runId}@example.com`;
  const receiverEmail = `e2e-receiver-${runId}@example.com`;
  const analystEmail = `e2e-analyst-${runId}@example.com`;
  const fraudAnalystEmail = `e2e-fraud-analyst-${runId}@example.com`;
  const bankEmployeeEmail = `e2e-bank-employee-${runId}@example.com`;
  const adminEmail = `e2e-admin-${runId}@example.com`;
  const initialPassword = 'E2E-initial-password-123';
  const changedPassword = 'E2E-changed-password-123';
  const resetPassword = 'E2E-reset-password-123';

  function bearer(token: string) {
    return `Bearer ${token}`;
  }

  async function cleanupUser(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return;

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.loginAttempt.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.securityEvent.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    fraudService = moduleFixture.get(FraudService);
  });

  it('covers authentication, device, MFA, password reset, SOC, and hardening flows', async () => {
    const rootResponse = await request(app.getHttpServer())
      .get('/')
      .set('Origin', 'http://localhost:5174')
      .set('X-Request-ID', 'e2e-root-request')
      .expect(200);

    expect(rootResponse.text).toBe('Hello World!');
    expect(rootResponse.headers['x-request-id']).toBe('e2e-root-request');
    expect(rootResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(rootResponse.headers['access-control-allow-origin']).toBe(
      'http://localhost:5174',
    );

    await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-ID', 'e2e-health-request')
      .expect(200)
      .expect((response) => {
        expect(response.headers['x-request-id']).toBe('e2e-health-request');
        expect(response.body).toMatchObject({
          status: 'ok',
          services: {
            api: { status: 'ok' },
            database: { status: 'ok' },
          },
        });
        expect(JSON.stringify(response.body)).not.toMatch(
          /DATABASE_URL|JWT_SECRET|MFA_ENCRYPTION_KEY|postgresql:\/\//i,
        );
      });

    await request(app.getHttpServer())
      .options('/transactions/transfer')
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'Authorization,Content-Type,X-Device-ID,X-Idempotency-Key',
      )
      .expect(204)
      .expect((response) => {
        expect(response.headers['access-control-allow-origin']).toBe(
          'http://localhost:5174',
        );
        expect(response.headers['access-control-allow-headers']).toContain(
          'X-Idempotency-Key',
        );
      });

    const malformedJsonResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .set('X-Request-ID', 'e2e-malformed-json-request')
      .send('{"email":')
      .expect(400);
    expect(bodyOf<ErrorResponseBody>(malformedJsonResponse)).toMatchObject({
      requestId: 'e2e-malformed-json-request',
      message: 'Malformed request payload',
    });

    const oversizedPayloadResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .set('X-Request-ID', 'e2e-payload-limit-request')
      .send(JSON.stringify({ payload: 'x'.repeat(1024 * 1024 + 1) }))
      .expect(413);
    expect(bodyOf<ErrorResponseBody>(oversizedPayloadResponse)).toMatchObject({
      requestId: 'e2e-payload-limit-request',
      message: 'Request payload is too large',
    });

    const validationResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .set('X-Request-ID', 'e2e-validation-request')
      .send({
        email: customerEmail,
        firstName: 'E2E',
        lastName: 'Customer',
        password: initialPassword,
        unexpected: 'rejected',
      })
      .expect(400);

    expect(validationResponse.headers['x-request-id']).toBe(
      'e2e-validation-request',
    );
    const validationBody = bodyOf<ErrorResponseBody>(validationResponse);
    expect(validationBody.requestId).toBe('e2e-validation-request');
    expect(validationBody.message).toEqual(
      expect.arrayContaining([expect.stringContaining('unexpected')]),
    );

    const registrationResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: customerEmail.toUpperCase(),
        firstName: 'E2E',
        lastName: 'Customer',
        password: initialPassword,
      })
      .expect(201);

    const registrationBody =
      bodyOf<RegistrationResponseBody>(registrationResponse);
    customerId = registrationBody.id;
    expect(registrationBody).toMatchObject({
      email: customerEmail,
      role: 'CUSTOMER',
      status: 'ACTIVE',
    });
    expect(registrationBody.passwordHash).toBeUndefined();

    const deviceId = `e2e-device-${runId}`;
    const firstLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Device-ID', deviceId)
      .send({ email: customerEmail, password: initialPassword })
      .expect(200);
    const firstLoginBody = bodyOf<LoginResponseBody>(firstLoginResponse);
    const firstAccessToken = firstLoginBody.accessToken as string;
    const firstRefreshToken = firstLoginBody.refreshToken as string;

    expect(firstAccessToken).toEqual(expect.any(String));
    expect(firstRefreshToken).toEqual(expect.any(String));
    expect(firstLoginBody.user).toMatchObject({
      id: customerId,
      email: customerEmail,
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', bearer(firstAccessToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<RegistrationResponseBody>(response);
        expect(body).toMatchObject({ id: customerId, email: customerEmail });
      });

    const devicesResponse = await request(app.getHttpServer())
      .get('/devices')
      .set('Authorization', bearer(firstAccessToken))
      .expect(200);
    const devicesBody = bodyOf<DeviceResponseBody[]>(devicesResponse);
    const registeredDevice = devicesBody.find(
      (device) => device.deviceId === deviceId,
    );
    expect(registeredDevice).toMatchObject({ trusted: false });
    if (!registeredDevice) throw new Error('E2E device was not registered');

    await request(app.getHttpServer())
      .patch(`/devices/${registeredDevice.id}/trust`)
      .set('Authorization', bearer(firstAccessToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<DeviceResponseBody>(response);
        expect(body.trusted).toBe(true);
      });
    await request(app.getHttpServer())
      .patch(`/devices/${registeredDevice.id}/untrust`)
      .set('Authorization', bearer(firstAccessToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<DeviceResponseBody>(response);
        expect(body.trusted).toBe(false);
      });

    const sessionsBeforeDeviceRevoke = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', bearer(firstAccessToken))
      .expect(200);
    const sessionsBeforeDeviceRevokeBody = bodyOf<SessionResponseBody[]>(
      sessionsBeforeDeviceRevoke,
    );
    expect(
      sessionsBeforeDeviceRevokeBody.some(
        (session) =>
          session.deviceId === deviceId && Number.isInteger(session.id),
      ),
    ).toBe(true);

    const deviceRevokeResponse = await request(app.getHttpServer())
      .delete(`/devices/${registeredDevice.id}/sessions`)
      .set('Authorization', bearer(firstAccessToken))
      .expect(200);
    const deviceRevokeBody = bodyOf<{ revokedCount: number }>(
      deviceRevokeResponse,
    );
    expect(deviceRevokeBody.revokedCount).toBe(1);

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', bearer(firstAccessToken))
      .send({
        currentPassword: initialPassword,
        newPassword: changedPassword,
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', bearer(firstAccessToken))
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Device-ID', deviceId)
      .send({ email: customerEmail, password: initialPassword })
      .expect(401);

    const changedLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Device-ID', deviceId)
      .send({ email: customerEmail, password: changedPassword })
      .expect(200);
    const changedLoginBody = bodyOf<LoginResponseBody>(changedLoginResponse);
    const changedAccessToken = changedLoginBody.accessToken as string;

    receiverId = (
      await prisma.user.create({
        data: {
          email: receiverEmail,
          passwordHash: await bcrypt.hash('E2E-receiver-password-123', 12),
          firstName: 'E2E',
          lastName: 'Receiver',
          role: 'CUSTOMER',
        },
      })
    ).id;
    const senderAccount = await prisma.bankAccount.create({
      data: {
        accountNumber: `E2ES-${runId}`,
        balance: '30000',
        currency: 'USD',
        userId: customerId,
      },
    });
    senderAccountId = senderAccount.id;
    const receiverAccount = await prisma.bankAccount.create({
      data: {
        accountNumber: `E2ER-${runId}`,
        balance: '1000',
        currency: 'USD',
        userId: receiverId,
      },
    });
    receiverAccountId = receiverAccount.id;
    beneficiaryId = (
      await prisma.beneficiary.create({
        data: {
          name: 'E2E Receiver',
          accountNumber: receiverAccount.accountNumber,
          bankName: 'BankShield',
          ownerId: customerId,
        },
      })
    ).id;

    jest.spyOn(fraudService, 'analyzeTransaction').mockResolvedValueOnce({
      risk_score: 12,
      risk_level: 'LOW',
      flagged: false,
      reasons: [],
    });
    const transferPayload = {
      senderAccountId,
      beneficiaryId,
      amount: 125,
      description: 'E2E low-risk transfer',
    };
    const transferIdempotencyKey = `e2e-transfer-${runId}`;
    const transferResponse = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', bearer(changedAccessToken))
      .set('X-Device-ID', deviceId)
      .set('X-Idempotency-Key', transferIdempotencyKey)
      .send(transferPayload)
      .expect(201);
    const transferBody = bodyOf<{
      transaction: { id: number; status: string; senderAccountId: number };
      idempotentReplay?: boolean;
    }>(transferResponse);
    completedTransferId = transferBody.transaction.id;
    expect(transferBody.idempotentReplay).toBeUndefined();
    expect(transferBody.transaction).toMatchObject({
      status: 'COMPLETED',
      senderAccountId,
    });

    const replayResponse = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', bearer(changedAccessToken))
      .set('X-Device-ID', deviceId)
      .set('X-Idempotency-Key', transferIdempotencyKey)
      .send(transferPayload)
      .expect(201);
    const replayBody = bodyOf<{
      transaction: { id: number; status: string };
      idempotentReplay: boolean;
    }>(replayResponse);
    expect(replayBody).toMatchObject({
      idempotentReplay: true,
      transaction: { id: completedTransferId, status: 'COMPLETED' },
    });
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', bearer(changedAccessToken))
      .set('X-Device-ID', deviceId)
      .set('X-Idempotency-Key', transferIdempotencyKey)
      .send({ ...transferPayload, amount: 126 })
      .expect(409);

    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', bearer(changedAccessToken))
      .set('X-Device-ID', deviceId)
      .send({ ...transferPayload, amount: 10_001 })
      .expect(400)
      .expect((response) => {
        const body = bodyOf<ErrorResponseBody>(response);
        expect(String(body.message)).toContain('per-transfer limit');
      });

    jest.spyOn(fraudService, 'analyzeTransaction').mockResolvedValueOnce({
      risk_score: 96,
      risk_level: 'CRITICAL',
      flagged: true,
      reasons: ['E2E high-risk transfer'],
    });
    const flaggedResponse = await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', bearer(changedAccessToken))
      .set('X-Device-ID', deviceId)
      .set('X-Idempotency-Key', `e2e-flagged-${runId}`)
      .send({ ...transferPayload, amount: 150, description: 'Flag me' })
      .expect(201);
    const flaggedBody = bodyOf<{
      transaction: { id: number; status: string };
      fraudAlert: { id: number; riskLevel: string };
    }>(flaggedResponse);
    flaggedTransferId = flaggedBody.transaction.id;
    flaggedFraudAlertId = flaggedBody.fraudAlert.id;
    expect(flaggedBody).toMatchObject({
      transaction: { status: 'FLAGGED' },
      fraudAlert: { riskLevel: 'CRITICAL' },
    });

    jest
      .spyOn(fraudService, 'analyzeTransaction')
      .mockRejectedValueOnce(
        new ServiceUnavailableException(
          'Fraud detection service is unavailable',
        ),
      );
    const rejectedIdempotencyKey = `e2e-rejected-${runId}`;
    await request(app.getHttpServer())
      .post('/transactions/transfer')
      .set('Authorization', bearer(changedAccessToken))
      .set('X-Device-ID', deviceId)
      .set('X-Idempotency-Key', rejectedIdempotencyKey)
      .send({
        ...transferPayload,
        amount: 50,
        description: 'Fraud-service outage path',
      })
      .expect(503);
    const rejectedTransfer = await prisma.transaction.findUnique({
      where: { idempotencyKey: rejectedIdempotencyKey },
      select: { id: true, status: true },
    });
    expect(rejectedTransfer).toMatchObject({ status: 'REJECTED' });
    rejectedTransferId = rejectedTransfer?.id;

    await request(app.getHttpServer())
      .get('/transactions/me')
      .set('Authorization', bearer(changedAccessToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<Array<{ id: number; status: string }>>(response);
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: completedTransferId,
              status: 'COMPLETED',
            }),
            expect.objectContaining({
              id: flaggedTransferId,
              status: 'FLAGGED',
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .post(`/transactions/${completedTransferId}/reverse`)
      .set('Authorization', bearer(changedAccessToken))
      .send({ reason: 'E2E customer requested reversal' })
      .expect(201)
      .expect((response) => {
        const body = bodyOf<{ transaction: { status: string } }>(response);
        expect(body.transaction.status).toBe('REVERSED');
      });
    await request(app.getHttpServer())
      .post(`/transactions/${completedTransferId}/reverse`)
      .set('Authorization', bearer(changedAccessToken))
      .send({ reason: 'E2E duplicate reversal' })
      .expect(409);

    const finalSenderAccount = await prisma.bankAccount.findUnique({
      where: { id: senderAccountId },
      select: { balance: true },
    });
    const finalReceiverAccount = await prisma.bankAccount.findUnique({
      where: { id: receiverAccountId },
      select: { balance: true },
    });
    expect(Number(finalSenderAccount?.balance)).toBe(30000);
    expect(Number(finalReceiverAccount?.balance)).toBe(1000);
    expect(
      await prisma.fraudAlert.findUnique({
        where: { id: flaggedFraudAlertId },
      }),
    ).toBeTruthy();
    expect(
      await prisma.securityEvent.findFirst({
        where: { userId: customerId, eventType: 'FRAUD_SERVICE_UNAVAILABLE' },
      }),
    ).toBeTruthy();
    jest.restoreAllMocks();

    transactionId = (
      await prisma.transaction.create({
        data: {
          reference: `e2e-transaction-${runId}`,
          amount: '125.50',
          currency: 'USD',
          type: 'TRANSFER',
          status: 'FLAGGED',
          riskScore: 88,
          riskLevel: 'HIGH',
        },
      })
    ).id;
    fraudAlertId = (
      await prisma.fraudAlert.create({
        data: {
          transactionId,
          riskScore: 88,
          riskLevel: 'HIGH',
          reason: 'E2E suspicious transfer',
        },
      })
    ).id;

    analystId = (
      await prisma.user.create({
        data: {
          email: analystEmail,
          passwordHash: await bcrypt.hash('E2E-analyst-password-123', 12),
          firstName: 'E2E',
          lastName: 'Analyst',
          role: 'SECURITY_ANALYST',
        },
      })
    ).id;
    fraudAnalystId = (
      await prisma.user.create({
        data: {
          email: fraudAnalystEmail,
          passwordHash: await bcrypt.hash('E2E-fraud-analyst-password-123', 12),
          firstName: 'E2E',
          lastName: 'Fraud Analyst',
          role: 'FRAUD_ANALYST',
        },
      })
    ).id;
    bankEmployeeId = (
      await prisma.user.create({
        data: {
          email: bankEmployeeEmail,
          passwordHash: await bcrypt.hash('E2E-bank-employee-password-123', 12),
          firstName: 'E2E',
          lastName: 'Bank Employee',
          role: 'BANK_EMPLOYEE',
        },
      })
    ).id;
    adminId = (
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash: await bcrypt.hash('E2E-admin-password-123', 12),
          firstName: 'E2E',
          lastName: 'Admin',
          role: 'ADMIN',
        },
      })
    ).id;
    const analystToken = await app.get(JwtService).signAsync({
      sub: analystId,
      email: analystEmail,
      role: 'SECURITY_ANALYST',
      type: 'access',
      tokenVersion: 0,
    });
    const fraudAnalystToken = await app.get(JwtService).signAsync({
      sub: fraudAnalystId,
      email: fraudAnalystEmail,
      role: 'FRAUD_ANALYST',
      type: 'access',
      tokenVersion: 0,
    });
    const bankEmployeeToken = await app.get(JwtService).signAsync({
      sub: bankEmployeeId,
      email: bankEmployeeEmail,
      role: 'BANK_EMPLOYEE',
      type: 'access',
      tokenVersion: 0,
    });
    const adminToken = await app.get(JwtService).signAsync({
      sub: adminId,
      email: adminEmail,
      role: 'ADMIN',
      type: 'access',
      tokenVersion: 0,
    });

    await request(app.getHttpServer())
      .get('/soc/summary')
      .set('Authorization', bearer(changedAccessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/fraud-alerts')
      .set('Authorization', bearer(changedAccessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', bearer(changedAccessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/security-events')
      .set('Authorization', bearer(changedAccessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', bearer(changedAccessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/accounts/me')
      .set('Authorization', bearer(changedAccessToken))
      .expect(200);

    const roleTokens = {
      CUSTOMER: changedAccessToken,
      BANK_EMPLOYEE: bankEmployeeToken,
      FRAUD_ANALYST: fraudAnalystToken,
      SECURITY_ANALYST: analystToken,
      ADMIN: adminToken,
    };
    const rbacMatrix = [
      {
        path: '/accounts/me',
        allowed: ['CUSTOMER', 'BANK_EMPLOYEE'],
      },
      {
        path: '/soc/summary',
        allowed: ['FRAUD_ANALYST', 'SECURITY_ANALYST', 'ADMIN'],
      },
      {
        path: '/fraud-alerts',
        allowed: ['FRAUD_ANALYST', 'SECURITY_ANALYST', 'ADMIN'],
      },
      {
        path: '/security-events',
        allowed: ['SECURITY_ANALYST', 'ADMIN'],
      },
      {
        path: '/audit-logs',
        allowed: ['SECURITY_ANALYST', 'ADMIN'],
      },
      {
        path: '/admin/users',
        allowed: ['ADMIN'],
      },
    ];

    await request(app.getHttpServer()).get('/soc/summary').expect(401);
    for (const route of rbacMatrix) {
      for (const [role, token] of Object.entries(roleTokens)) {
        await request(app.getHttpServer())
          .get(route.path)
          .set('Authorization', bearer(token))
          .expect(route.allowed.includes(role) ? 200 : 403);
      }
    }

    const summaryResponse = await request(app.getHttpServer())
      .get('/soc/summary')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const summaryBody = bodyOf<SummaryResponseBody>(summaryResponse);
    expect(typeof summaryBody.total_alerts).toBe('number');
    expect(typeof summaryBody.critical_alerts).toBe('number');
    expect(typeof summaryBody.open_cases).toBe('number');
    expect(typeof summaryBody.total_security_events).toBe('number');
    expect(summaryBody.total_alerts).toBeGreaterThanOrEqual(1);

    const alertsResponse = await request(app.getHttpServer())
      .get('/soc/alerts')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const alertsBody = bodyOf<AlertResponseBody[]>(alertsResponse);
    expect(
      alertsBody.some(
        (alert) =>
          alert.id === fraudAlertId &&
          alert.risk_score === 88 &&
          alert.severity === 'HIGH' &&
          alert.status === 'OPEN',
      ),
    ).toBe(true);

    const directAlertsResponse = await request(app.getHttpServer())
      .get('/fraud-alerts?severity=HIGH&minRiskScore=80&limit=10')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const directAlertsBody = bodyOf<AlertResponseBody[]>(directAlertsResponse);
    expect(directAlertsBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fraudAlertId, riskLevel: 'HIGH' }),
      ]),
    );

    await request(app.getHttpServer())
      .get('/fraud-alerts/summary?riskLevel=HIGH')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<{
          total: number;
          byRiskLevel: Record<string, number>;
        }>(response);
        expect(body.total).toBeGreaterThanOrEqual(1);
        expect(body.byRiskLevel.HIGH).toBeGreaterThanOrEqual(1);
      });

    await request(app.getHttpServer())
      .get('/soc/analytics/risk-distribution')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<Record<string, number>>(response);
        expect(body.HIGH).toBeGreaterThanOrEqual(1);
      });
    await request(app.getHttpServer())
      .get('/soc/analytics/alerts-per-day')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<unknown[]>(response);
        expect(Array.isArray(body)).toBe(true);
      });
    await request(app.getHttpServer())
      .get('/soc/analytics/cases-by-status')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<Record<string, number>>(response);
        expect(typeof body.OPEN).toBe('number');
        expect(typeof body.INVESTIGATING).toBe('number');
        expect(typeof body.RESOLVED).toBe('number');
        expect(typeof body.FALSE_POSITIVE).toBe('number');
      });
    await request(app.getHttpServer())
      .get('/soc/analytics/security-events-by-type')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/soc/security-events')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<unknown[]>(response);
        expect(Array.isArray(body)).toBe(true);
      });
    const directSecurityEventsResponse = await request(app.getHttpServer())
      .get('/security-events?limit=25')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const directSecurityEventsBody = bodyOf<
      Array<{ id: number; event_type: string; severity: string }>
    >(directSecurityEventsResponse);
    expect(directSecurityEventsBody.length).toBeGreaterThan(0);
    const securityEventId = directSecurityEventsBody[0].id;
    await request(app.getHttpServer())
      .get(`/security-events/${securityEventId}`)
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        expect(bodyOf<{ id: number }>(response).id).toBe(securityEventId);
      });
    await request(app.getHttpServer())
      .get('/security-events/summary')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<{ total: number; byRiskLevel: object }>(response);
        expect(body.total).toBeGreaterThan(0);
        expect(body.byRiskLevel).toBeDefined();
      });
    await request(app.getHttpServer())
      .get('/security-events/types')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const createdSecurityEventResponse = await request(app.getHttpServer())
      .post('/security-events')
      .set('Authorization', bearer(analystToken))
      .send({
        eventType: 'E2E_MANUAL_REVIEW',
        riskLevel: 'MEDIUM',
        description: 'E2E security event API verification',
      })
      .expect(201);
    expect(
      bodyOf<{ eventType: string }>(createdSecurityEventResponse).eventType,
    ).toBe('E2E_MANUAL_REVIEW');
    await request(app.getHttpServer())
      .get(
        `/security-events?eventType=E2E_MANUAL_REVIEW&riskLevel=MEDIUM&userId=${analystId}&startDate=2026-01-01T00:00:00.000Z&limit=5`,
      )
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body =
          bodyOf<Array<{ eventType: string; userId: number }>>(response);
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              eventType: 'E2E_MANUAL_REVIEW',
              userId: analystId,
            }),
          ]),
        );
      });
    await request(app.getHttpServer())
      .get('/soc/audit-logs')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<unknown[]>(response);
        expect(Array.isArray(body)).toBe(true);
      });
    const directAuditLogsResponse = await request(app.getHttpServer())
      .get('/audit-logs?limit=25')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const directAuditLogsBody = bodyOf<Array<{ id: number }>>(
      directAuditLogsResponse,
    );
    expect(directAuditLogsBody.length).toBeGreaterThan(0);
    const auditLogId = directAuditLogsBody[0].id;
    await request(app.getHttpServer())
      .get(`/audit-logs/${auditLogId}`)
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        expect(bodyOf<{ id: number }>(response).id).toBe(auditLogId);
      });
    await request(app.getHttpServer())
      .get('/audit-logs/summary')
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body = bodyOf<{ total: number; byAction: object }>(response);
        expect(body.total).toBeGreaterThan(0);
        expect(body.byAction).toBeDefined();
      });
    await request(app.getHttpServer())
      .get(
        `/audit-logs?action=SECURITY_EVENT_CREATED&user_id=${analystId}&search=SecurityEvent&startDate=2026-01-01T00:00:00.000Z&limit=10`,
      )
      .set('Authorization', bearer(analystToken))
      .expect(200)
      .expect((response) => {
        const body =
          bodyOf<Array<{ action: string; userId: number }>>(response);
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'SECURITY_EVENT_CREATED',
              userId: analystId,
            }),
          ]),
        );
      });
    await request(app.getHttpServer())
      .patch(`/audit-logs/${auditLogId}`)
      .set('Authorization', bearer(adminToken))
      .send({ details: 'tamper attempt' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/audit-logs/${auditLogId}`)
      .set('Authorization', bearer(adminToken))
      .expect(404);
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', bearer(analystToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/accounts/me')
      .set('Authorization', bearer(analystToken))
      .expect(403);

    await request(app.getHttpServer())
      .get('/fraud-alerts')
      .set('Authorization', bearer(fraudAnalystToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/security-events')
      .set('Authorization', bearer(fraudAnalystToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', bearer(fraudAnalystToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', bearer(fraudAnalystToken))
      .expect(403);

    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', bearer(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', bearer(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/security-events')
      .set('Authorization', bearer(adminToken))
      .expect(200);

    const alertStatusResponse = await request(app.getHttpServer())
      .patch(`/soc/alerts/${fraudAlertId}/status`)
      .set('Authorization', bearer(analystToken))
      .send({ status: 'INVESTIGATING' })
      .expect(200);
    const alertStatusBody = bodyOf<StatusResponseBody>(alertStatusResponse);
    expect(alertStatusBody.alert?.status).toBe('INVESTIGATING');

    await request(app.getHttpServer())
      .post(`/soc/alerts/${fraudAlertId}/notes`)
      .set('Authorization', bearer(analystToken))
      .send({ note: 'E2E analyst note' })
      .expect(201);

    const caseResponse = await request(app.getHttpServer())
      .post('/soc/cases')
      .set('Authorization', bearer(analystToken))
      .send({
        alert_id: fraudAlertId,
        assigned_analyst: 'E2E Analyst',
        summary: 'Review the suspicious transfer',
      })
      .expect(201);
    const caseBody = bodyOf<StatusResponseBody>(caseResponse);
    expect(caseBody.case).toMatchObject({
      alert_id: fraudAlertId,
      status: 'INVESTIGATING',
    });
    investigationCaseId = caseBody.case?.id;
    expect(investigationCaseId).toEqual(expect.any(Number));

    await request(app.getHttpServer())
      .post('/soc/cases')
      .set('Authorization', bearer(analystToken))
      .send({
        alert_id: fraudAlertId,
        assigned_analyst: 'E2E Analyst',
        summary: 'Duplicate investigation should be rejected',
      })
      .expect(400);

    const casesResponse = await request(app.getHttpServer())
      .get('/soc/cases')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const casesBody = bodyOf<CaseResponseBody[]>(casesResponse);
    expect(
      casesBody.some(
        (item) =>
          item.id === investigationCaseId && item.alert_id === fraudAlertId,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/soc/cases/${investigationCaseId}/status`)
      .set('Authorization', bearer(analystToken))
      .send({ status: 'RESOLVED' })
      .expect(200)
      .expect((response) => {
        const body = bodyOf<StatusResponseBody>(response);
        expect(body.case?.status).toBe('RESOLVED');
      });

    const csvResponse = await request(app.getHttpServer())
      .get('/soc/reports/alerts.csv')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    expect(csvResponse.headers['content-type']).toMatch(/text\/csv/);
    expect(csvResponse.text).toContain('id,amount,currency');
    expect(csvResponse.text).toContain(String(fraudAlertId));

    const reportResponse = await request(app.getHttpServer())
      .get('/soc/reports/security-report.json')
      .set('Authorization', bearer(analystToken))
      .expect(200);
    const reportBody = bodyOf<SecurityReportResponseBody>(reportResponse);
    expect(typeof reportBody.summary.total_alerts).toBe('number');
    expect(Object.keys(reportBody.risk_distribution).length).toBeGreaterThan(0);
    expect(Object.keys(reportBody.cases_by_status).length).toBeGreaterThan(0);

    const mfaSetupResponse = await request(app.getHttpServer())
      .post('/auth/mfa/setup')
      .set('Authorization', bearer(changedAccessToken))
      .expect(200);
    const mfaSetupBody = bodyOf<MfaSetupResponseBody>(mfaSetupResponse);
    expect(mfaSetupBody.manualEntryKey).toEqual(expect.any(String));
    expect(mfaSetupBody.qrCodeDataUrl).toEqual(expect.any(String));

    const mfaVerifyResponse = await request(app.getHttpServer())
      .post('/auth/mfa/verify-setup')
      .set('Authorization', bearer(changedAccessToken))
      .send({ code: '123456' })
      .expect(200);
    const mfaVerifyBody = bodyOf<MfaVerifyResponseBody>(mfaVerifyResponse);
    expect(mfaVerifyBody.mfaEnabled).toBe(true);
    expect(mfaVerifyBody.recoveryCodes.length).toBe(10);
    expect(
      mfaVerifyBody.recoveryCodes.every((code) => typeof code === 'string'),
    ).toBe(true);

    const firstMfaChallengeResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Device-ID', deviceId)
      .send({ email: customerEmail, password: changedPassword })
      .expect(200);
    const firstMfaChallengeBody = bodyOf<LoginResponseBody>(
      firstMfaChallengeResponse,
    );
    expect(firstMfaChallengeBody.mfaRequired).toBe(true);

    const firstMfaSessionResponse = await request(app.getHttpServer())
      .post('/auth/mfa/login-verify')
      .send({
        mfaToken: firstMfaChallengeBody.mfaToken,
        code: '123456',
      })
      .expect(200);
    const firstMfaSessionBody = bodyOf<LoginResponseBody>(
      firstMfaSessionResponse,
    );
    const firstMfaAccessToken = firstMfaSessionBody.accessToken as string;
    const firstMfaRefreshToken = firstMfaSessionBody.refreshToken as string;

    const sessionsResponse = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', bearer(firstMfaAccessToken))
      .expect(200);
    const sessionsBody = bodyOf<SessionResponseBody[]>(sessionsResponse);
    const sessionToRevoke = sessionsBody.find(
      (session) => session.deviceId === deviceId,
    );
    expect(sessionToRevoke).toBeDefined();

    await request(app.getHttpServer())
      .delete(`/auth/sessions/${sessionToRevoke.id}`)
      .set('Authorization', bearer(firstMfaAccessToken))
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstMfaRefreshToken })
      .expect(401);

    const secondDeviceId = `e2e-device-second-${runId}`;
    const secondMfaChallengeResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Device-ID', secondDeviceId)
      .send({ email: customerEmail, password: changedPassword })
      .expect(200);
    const secondMfaSessionResponse = await request(app.getHttpServer())
      .post('/auth/mfa/login-verify')
      .send({
        mfaToken: bodyOf<LoginResponseBody>(secondMfaChallengeResponse)
          .mfaToken,
        code: '123456',
      })
      .expect(200);
    const secondMfaSessionBody = bodyOf<LoginResponseBody>(
      secondMfaSessionResponse,
    );
    const secondMfaAccessToken = secondMfaSessionBody.accessToken as string;
    const secondMfaRefreshToken = secondMfaSessionBody.refreshToken as string;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: secondMfaRefreshToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: secondMfaRefreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/sessions/logout-all')
      .set('Authorization', bearer(secondMfaAccessToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', bearer(secondMfaAccessToken))
      .expect(401);

    const forgotPasswordResponse = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: customerEmail })
      .expect(200);
    const forgotPasswordBody = bodyOf<{ message: string; token?: unknown }>(
      forgotPasswordResponse,
    );
    expect(forgotPasswordBody.message).toContain('If an account exists');
    expect(forgotPasswordBody.token).toBeUndefined();

    const rawResetToken = `e2e-reset-token-${runId}`;
    await prisma.passwordResetToken.deleteMany({
      where: { userId: customerId },
    });
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: createHash('sha256').update(rawResetToken).digest('hex'),
        userId: customerId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: rawResetToken, newPassword: resetPassword })
      .expect(200);

    const resetUser = await prisma.user.findUnique({
      where: { id: customerId },
      select: { passwordHash: true },
    });
    expect(resetUser).not.toBeNull();
    await expect(
      bcrypt.compare(resetPassword, resetUser?.passwordHash ?? ''),
    ).resolves.toBe(true);

    const notFoundResponse = await request(app.getHttpServer())
      .get('/route-that-does-not-exist')
      .set('X-Request-ID', 'e2e-not-found-request')
      .expect(404);
    const notFoundBody = bodyOf<ErrorResponseBody>(notFoundResponse);
    expect(notFoundBody.requestId).toBe('e2e-not-found-request');
  });

  afterAll(async () => {
    try {
      if (flaggedFraudAlertId) {
        await prisma.investigationCase.deleteMany({
          where: { alertId: flaggedFraudAlertId },
        });
        await prisma.fraudAlert.deleteMany({
          where: { id: flaggedFraudAlertId },
        });
      }
      await prisma.transaction.deleteMany({
        where: {
          id: {
            in: [
              completedTransferId,
              flaggedTransferId,
              rejectedTransferId,
            ].filter((id): id is number => typeof id === 'number'),
          },
        },
      });
      if (fraudAlertId) {
        await prisma.investigationCase.deleteMany({
          where: { alertId: fraudAlertId },
        });
      }
      if (fraudAlertId) {
        await prisma.fraudAlert.delete({ where: { id: fraudAlertId } });
      }
      if (transactionId) {
        await prisma.transaction.delete({ where: { id: transactionId } });
      }
      if (beneficiaryId) {
        await prisma.beneficiary.deleteMany({ where: { id: beneficiaryId } });
      }
      await prisma.bankAccount.deleteMany({
        where: {
          id: {
            in: [senderAccountId, receiverAccountId].filter(
              (id): id is number => typeof id === 'number',
            ),
          },
        },
      });
      if (customerId) await cleanupUser(customerEmail);
      if (receiverId) await cleanupUser(receiverEmail);
      if (analystId) await cleanupUser(analystEmail);
      if (fraudAnalystId) await cleanupUser(fraudAnalystEmail);
      if (bankEmployeeId) await cleanupUser(bankEmployeeEmail);
      if (adminId) await cleanupUser(adminEmail);
    } finally {
      await app?.close();
    }
  });
});
