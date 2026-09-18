import { validateConfiguration } from './configuration';

const validConfiguration = {
  DATABASE_URL: 'postgresql://postgres:password@localhost:5432/bankshield',
  JWT_SECRET: 'a'.repeat(64),
  MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
  FRAUD_ENGINE_URL: 'http://127.0.0.1:8000',
  PORT: '3000',
  NODE_ENV: 'test',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174',
};

describe('validateConfiguration', () => {
  it('normalizes a complete secure configuration', () => {
    expect(validateConfiguration(validConfiguration)).toMatchObject({
      PORT: 3000,
      NODE_ENV: 'test',
      CORS_ORIGINS: validConfiguration.CORS_ORIGINS,
    });
  });

  it.each([
    ['DATABASE_URL', 'not-a-database-url'],
    ['JWT_SECRET', 'too-short'],
    ['MFA_ENCRYPTION_KEY', 'not-hex'],
    ['FRAUD_ENGINE_URL', 'not-a-url'],
    ['PORT', '70000'],
    ['CORS_ORIGINS', 'not-an-origin'],
  ])('rejects an invalid %s value', (key, value) => {
    expect(() =>
      validateConfiguration({ ...validConfiguration, [key]: value }),
    ).toThrow('Invalid BankShield configuration');
  });

  it('rejects placeholder JWT secrets', () => {
    expect(() =>
      validateConfiguration({
        ...validConfiguration,
        JWT_SECRET: 'replace-with-a-unique-secret-at-least-32-characters-long',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('requires explicit CORS origins in production', () => {
    expect(() =>
      validateConfiguration({
        ...validConfiguration,
        NODE_ENV: 'production',
        CORS_ORIGINS: '',
      }),
    ).toThrow('CORS_ORIGINS must be explicitly configured in production');
  });

  it('rejects localhost service URLs in production', () => {
    expect(() =>
      validateConfiguration({
        ...validConfiguration,
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://postgres:password@localhost:5432/bankshield',
      }),
    ).toThrow('DATABASE_URL must not point to localhost in production');

    expect(() =>
      validateConfiguration({
        ...validConfiguration,
        NODE_ENV: 'production',
        FRAUD_ENGINE_URL: 'http://127.0.0.1:8000',
      }),
    ).toThrow('FRAUD_ENGINE_URL must not point to localhost in production');
  });
});
