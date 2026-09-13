import type { LoginRateLimitOptions } from './securityOptions.js';
import { runInTransaction } from '../database/transaction.js';
import { LoginRateLimitCounterModel } from '../models/LoginRateLimitCounter.js';
import type { ClientSession } from 'mongoose';

export interface LoginAttempt {
  ip: string;
  registration: string;
}

export interface ReservedLoginAttempt {
  ip: string;
  registration: string;
}

export interface LoginRateLimiter {
  reserve(input: LoginAttempt): Promise<ReservedLoginAttempt | null>;
  recordFailure(input: ReservedLoginAttempt): Promise<void>;
  recordSuccess(input: ReservedLoginAttempt): Promise<void>;
  release(input: ReservedLoginAttempt): Promise<void>;
}

type CounterScope = 'ip' | 'registration';

interface CounterInput {
  scope: CounterScope;
  value: string;
}

function normalizeRegistration(registration: string): string {
  return registration.trim().toLowerCase();
}

function counterKey(scope: CounterScope, value: string): string {
  return `${scope}:${value}`;
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function hasErrorLabel(error: unknown, label: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'errorLabels' in error
    && Array.isArray(error.errorLabels)
    && error.errorLabels.includes(label);
}

function isRetryableReservationError(error: unknown): boolean {
  return isDuplicateKeyError(error)
    || hasErrorLabel(error, 'TransientTransactionError')
    || hasErrorLabel(error, 'UnknownTransactionCommitResult');
}

async function withReservationRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableReservationError(error) || attempt === 4) {
        throw error;
      }
    }
  }

  throw new Error('Unreachable reservation retry state');
}

async function readCount(counter: CounterInput, now: Date): Promise<number> {
  const document = await LoginRateLimitCounterModel.findOne({
    key: counterKey(counter.scope, counter.value),
    expiresAt: { $gt: now },
  })
    .select({ count: 1, _id: 0 })
    .lean();

  return document?.count ?? 0;
}

async function readCounterDocument(
  counter: CounterInput,
  session: ClientSession,
) {
  return LoginRateLimitCounterModel.findOne({ key: counterKey(counter.scope, counter.value) })
    .session(session)
    .lean()
    .exec();
}

function activeCount(document: { count: number; expiresAt: Date } | null, now: Date): number {
  if (!document || document.expiresAt.getTime() <= now.getTime()) {
    return 0;
  }

  return document.count;
}

function activeExpiry(
  document: { expiresAt: Date } | null,
  now: Date,
  windowMs: number,
): Date {
  if (!document || document.expiresAt.getTime() <= now.getTime()) {
    return new Date(now.getTime() + windowMs);
  }

  return document.expiresAt;
}

async function writeCount(
  counter: CounterInput,
  count: number,
  expiresAt: Date,
  session: ClientSession,
): Promise<void> {
  const key = counterKey(counter.scope, counter.value);

  if (count <= 0) {
    await LoginRateLimitCounterModel.deleteOne({ key }, { session });
    return;
  }

  await LoginRateLimitCounterModel.updateOne(
    { key },
    {
      $set: {
        key,
        scope: counter.scope,
        value: counter.value,
        count,
        expiresAt,
      },
    },
    { upsert: true, session },
  );
}

async function decrementReservation(
  counter: CounterInput,
  session: ClientSession,
): Promise<void> {
  const document = await LoginRateLimitCounterModel.findOne({
    key: counterKey(counter.scope, counter.value),
  })
    .session(session)
    .lean()
    .exec();

  if (!document) {
    return;
  }

  await writeCount(counter, document.count - 1, document.expiresAt, session);
}

export function createLoginRateLimiter(options: LoginRateLimitOptions): LoginRateLimiter {
  return {
    async reserve(input) {
      const now = options.clock();
      const registration = normalizeRegistration(input.registration);
      const ipCounter = { scope: 'ip', value: input.ip } as const;
      const registrationCounter = registration
        ? { scope: 'registration', value: registration } as const
        : null;

      return withReservationRetry(async () => runInTransaction(async (session) => {
        const [ipDocument, registrationDocument] = await Promise.all([
          readCounterDocument(ipCounter, session),
          registrationCounter ? readCounterDocument(registrationCounter, session) : Promise.resolve(null),
        ]);

        const ipCount = activeCount(ipDocument, now);
        const registrationCount = registrationDocument
          ? activeCount(registrationDocument, now)
          : 0;

        if (ipCount >= options.maxAttemptsPerIp || registrationCount >= options.maxAttemptsPerRegistration) {
          return null;
        }

        await writeCount(
          ipCounter,
          ipCount + 1,
          activeExpiry(ipDocument, now, options.windowMs),
          session,
        );

        if (registrationCounter) {
          await writeCount(
            registrationCounter,
            registrationCount + 1,
            activeExpiry(registrationDocument, now, options.windowMs),
            session,
          );
        }

        return {
          ip: input.ip,
          registration,
        };
      }));
    },

    async recordFailure(input) {
      void input;
    },

    async recordSuccess(input) {
      await runInTransaction(async (session) => {
        await decrementReservation({ scope: 'ip', value: input.ip }, session);

        if (input.registration) {
          await LoginRateLimitCounterModel.deleteOne({
            key: counterKey('registration', input.registration),
          }, { session });
        }
      });
    },

    async release(input) {
      await runInTransaction(async (session) => {
        await decrementReservation({ scope: 'ip', value: input.ip }, session);

        if (input.registration) {
          await decrementReservation({ scope: 'registration', value: input.registration }, session);
        }
      });
    },
  };
}
