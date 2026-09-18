const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

function readString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === 'string' ? value.trim() : '';
}

function requirePostgresUrl(
  config: Record<string, unknown>,
  key: string,
  errors: string[],
) {
  const value = readString(config, key);

  if (!value) {
    errors.push(`${key} is required`);
    return '';
  }

  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      errors.push(`${key} must be a PostgreSQL connection URL`);
    }
  } catch {
    errors.push(`${key} must be a valid URL`);
  }

  return value;
}

function requireHttpUrl(
  config: Record<string, unknown>,
  key: string,
  errors: string[],
) {
  const value = readString(config, key);

  if (!value) {
    errors.push(`${key} is required`);
    return '';
  }

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push(`${key} must use http or https`);
    }
  } catch {
    errors.push(`${key} must be a valid URL`);
  }

  return value;
}

function getCorsOrigins(config: Record<string, unknown>, errors: string[]) {
  const configured = readString(config, 'CORS_ORIGINS');
  const origins = configured
    ? configured
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : defaultCorsOrigins;

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash
      ) {
        errors.push(`CORS_ORIGINS contains an invalid origin: ${origin}`);
      }
    } catch {
      errors.push(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return origins.join(',');
}

function isLocalServiceUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function validateConfiguration(config: Record<string, unknown>) {
  const errors: string[] = [];
  const databaseUrl = requirePostgresUrl(config, 'DATABASE_URL', errors);
  const fraudEngineUrl = requireHttpUrl(config, 'FRAUD_ENGINE_URL', errors);
  const jwtSecret = readString(config, 'JWT_SECRET');
  const mfaEncryptionKey = readString(config, 'MFA_ENCRYPTION_KEY');
  const nodeEnv = readString(config, 'NODE_ENV') || 'development';
  const rawPort = readString(config, 'PORT') || '3000';
  const port = Number(rawPort);
  const configuredCorsOrigins = readString(config, 'CORS_ORIGINS');

  if (
    jwtSecret.length < 32 ||
    /replace-with|change-me|changeme/i.test(jwtSecret)
  ) {
    errors.push(
      'JWT_SECRET must be at least 32 characters and must be replaced',
    );
  }

  if (!/^[0-9a-f]{64}$/i.test(mfaEncryptionKey)) {
    errors.push('MFA_ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
  }

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, test, or production');
  }

  if (nodeEnv === 'production' && !configuredCorsOrigins) {
    errors.push('CORS_ORIGINS must be explicitly configured in production');
  }

  const corsOrigins = getCorsOrigins(config, errors);

  if (nodeEnv === 'production') {
    if (isLocalServiceUrl(databaseUrl)) {
      errors.push('DATABASE_URL must not point to localhost in production');
    }

    if (isLocalServiceUrl(fraudEngineUrl)) {
      errors.push('FRAUD_ENGINE_URL must not point to localhost in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid BankShield configuration: ${errors.join('; ')}`);
  }

  return {
    ...config,
    DATABASE_URL: databaseUrl,
    FRAUD_ENGINE_URL: fraudEngineUrl,
    JWT_SECRET: jwtSecret,
    MFA_ENCRYPTION_KEY: mfaEncryptionKey,
    NODE_ENV: nodeEnv,
    PORT: port,
    CORS_ORIGINS: corsOrigins,
  };
}

export { defaultCorsOrigins };
