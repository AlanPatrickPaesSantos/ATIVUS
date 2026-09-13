type NodeEnv = 'development' | 'test' | 'production';

export function parsePort(value: string | undefined): number {
  if (!value) return 3000;

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

export function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === undefined || value === '') {
    return 'development';
  }

  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }

  throw new Error(`Invalid NODE_ENV value: ${value}`);
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value: ${value}`);
  }

  return parsed;
}

export function parseCsvList(value: string | undefined): string[] {
  if (value === undefined || value === '') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const env = {
  NODE_ENV: parseNodeEnv(process.env.NODE_ENV),
  PORT: parsePort(process.env.PORT),
  SESSION_COOKIE_SECURE: parseBoolean(
    process.env.SESSION_COOKIE_SECURE,
    parseNodeEnv(process.env.NODE_ENV) === 'production',
  ),
  LOGIN_RATE_LIMIT_WINDOW_MS: parsePositiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 60_000),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP: parsePositiveInteger(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP, 10),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_REGISTRATION: parsePositiveInteger(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_REGISTRATION, 5),
  SESSION_ABSOLUTE_TTL_MS: parsePositiveInteger(process.env.SESSION_ABSOLUTE_TTL_MS, 43_200_000),
  SESSION_IDLE_TTL_MS: parsePositiveInteger(process.env.SESSION_IDLE_TTL_MS, 1_800_000),
  ALLOWED_ORIGINS: parseCsvList(process.env.ALLOWED_ORIGINS),
} as const;
