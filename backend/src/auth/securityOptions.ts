import { env } from '../config/env.js';

export type Clock = () => Date;

export interface LoginRateLimitOptions {
  windowMs: number;
  maxAttemptsPerIp: number;
  maxAttemptsPerRegistration: number;
  clock: Clock;
}

export interface SessionTimingOptions {
  absoluteTtlMs: number;
  idleTtlMs: number;
  clock: Clock;
}

export interface OriginProtectionOptions {
  allowedOrigins: string[];
}

export interface AuthSecurityOptionsInput {
  clock?: Clock;
  loginRateLimit?: Partial<Omit<LoginRateLimitOptions, 'clock'>>;
  session?: Partial<Omit<SessionTimingOptions, 'clock'>>;
  originProtection?: Partial<OriginProtectionOptions>;
}

const defaultClock: Clock = () => new Date();

export function resolveClock(clock?: Clock): Clock {
  return clock ?? defaultClock;
}

export function resolveLoginRateLimitOptions(
  input: AuthSecurityOptionsInput['loginRateLimit'] = {},
  clock?: Clock,
): LoginRateLimitOptions {
  return {
    windowMs: input.windowMs ?? env.LOGIN_RATE_LIMIT_WINDOW_MS,
    maxAttemptsPerIp: input.maxAttemptsPerIp ?? env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
    maxAttemptsPerRegistration: input.maxAttemptsPerRegistration ?? env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_REGISTRATION,
    clock: resolveClock(clock),
  };
}

export function resolveSessionTimingOptions(
  input: AuthSecurityOptionsInput['session'] = {},
  clock?: Clock,
): SessionTimingOptions {
  return {
    absoluteTtlMs: input.absoluteTtlMs ?? env.SESSION_ABSOLUTE_TTL_MS,
    idleTtlMs: input.idleTtlMs ?? env.SESSION_IDLE_TTL_MS,
    clock: resolveClock(clock),
  };
}

export function resolveOriginProtectionOptions(
  input: AuthSecurityOptionsInput['originProtection'] = {},
): OriginProtectionOptions {
  return {
    allowedOrigins: input.allowedOrigins ?? env.ALLOWED_ORIGINS,
  };
}
