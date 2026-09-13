import { isValidObjectId } from 'mongoose';

import type { AuditFailureReason } from '../models/AuditEvent.js';
import { UserModel, type UnitReference, type UserRole } from '../models/User.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import {
  createSession as persistSession,
  findSessionRecord,
  revokeSession,
  touchSession,
} from '../repositories/sessionsRepository.js';
import { resolveCanonicalUnitForRole } from './activeUnitScope.js';
import { resolveSessionTimingOptions, type AuthSecurityOptionsInput } from './securityOptions.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password.js';

export const SESSION_COOKIE_NAME = 'sigat_session';

export interface SessionContext {
  userId: string;
  name: string;
  registration: string;
  role: UserRole;
  unit: UnitReference | null;
  mustChangePassword?: boolean;
}

interface AuthenticatedUserRecord extends SessionContext {
  situation: 'active' | 'blocked' | 'inactive';
  passwordHash: string;
  mustChangePassword: boolean;
}

export class AuthError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface LoginResult {
  sessionId: string;
  context: SessionContext;
}

export interface SessionService {
  login(registration: string, password: string): Promise<LoginResult>;
  getSessionContext(sessionId: string): Promise<SessionContext | null>;
  logout(sessionId: string, userId: string): Promise<void>;
  recordMissingSessionCookie(): Promise<void>;
}

const INVALID_CREDENTIALS_ERROR = new AuthError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas.');

function sessionActivityAt(session: Awaited<ReturnType<typeof findSessionRecord>>): Date | null {
  if (!session) {
    return null;
  }

  return session.lastActivityAt ?? session.updatedAt ?? session.createdAt;
}

async function findUserForAuthentication(registration: string): Promise<AuthenticatedUserRecord | null> {
  const user = await UserModel.findOne({ registration })
    .select('+passwordHash')
    .exec();

  if (!user || typeof user.passwordHash !== 'string') {
    return null;
  }

  const role = user.role as UserRole;
  const unit = await resolveCanonicalUnitForRole(
    role,
    (user.unit as UnitReference | null | undefined) ?? null,
  );

  if (role === 'unit_user' && !unit) {
    return null;
  }

  return {
    userId: user.id,
    name: user.name as string,
    registration: user.registration as string,
    role,
    unit,
    situation: user.situation as 'active' | 'blocked' | 'inactive',
    passwordHash: user.passwordHash,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

async function findActiveSessionUser(userId: string): Promise<SessionContext | null> {
  if (!isValidObjectId(userId)) {
    return null;
  }

  const user = await UserModel.findOne({ _id: userId, situation: 'active' }).exec();

  if (!user) {
    return null;
  }

  const role = user.role as UserRole;
  const unit = await resolveCanonicalUnitForRole(
    role,
    (user.unit as UnitReference | null | undefined) ?? null,
  );

  if (role === 'unit_user' && !unit) {
    return null;
  }

  const context: SessionContext = {
    userId: user.id,
    name: user.name as string,
    registration: user.registration as string,
    role,
    unit,
  };

  if (user.mustChangePassword) {
    context.mustChangePassword = true;
  }

  return context;
}

async function findSessionUserForAudit(userId: string): Promise<string | null> {
  if (!isValidObjectId(userId)) {
    return null;
  }

  const user = await UserModel.findById(userId).select('_id').lean().exec();

  return user?._id ? String(user._id) : null;
}

function toSessionContext(user: Pick<AuthenticatedUserRecord, 'userId' | 'name' | 'registration' | 'role' | 'unit' | 'mustChangePassword'>): SessionContext {
  const context: SessionContext = {
    userId: user.userId,
    name: user.name,
    registration: user.registration,
    role: user.role,
    unit: user.unit,
  };

  if (user.mustChangePassword) {
    context.mustChangePassword = true;
  }

  return context;
}

async function recordLoginFailure(userId: string | null): Promise<never> {
  await recordAuditEvent({
    action: 'auth.login',
    userId,
    result: 'failure',
  });

  throw INVALID_CREDENTIALS_ERROR;
}

async function recordSessionFailure(
  reason: AuditFailureReason,
  userId: string | null = null,
): Promise<void> {
  await recordAuditEvent({
    action: 'auth.session',
    userId,
    result: 'failure',
    reason,
  });
}

export function createSessionService(options: Pick<AuthSecurityOptionsInput, 'clock' | 'session'> = {}): SessionService {
  const sessionTiming = resolveSessionTimingOptions(options.session, options.clock);

  return {
    async login(registration, password) {
      const normalizedRegistration = registration.trim();
      const user = normalizedRegistration
        ? await findUserForAuthentication(normalizedRegistration)
        : null;
      const passwordMatches = await verifyPassword(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!user || user.situation !== 'active' || !passwordMatches) {
        return recordLoginFailure(user?.userId ?? null);
      }

      const issuedAt = sessionTiming.clock();
      const sessionId = await persistSession(user.userId, {
        lastActivityAt: issuedAt,
        expiresAt: new Date(issuedAt.getTime() + sessionTiming.absoluteTtlMs),
      });
      const context = toSessionContext(user);

      await recordAuditEvent({
        action: 'auth.login',
        userId: user.userId,
        result: 'success',
      });

      return { sessionId, context };
    },

    async getSessionContext(sessionId) {
      const session = await findSessionRecord(sessionId);

      if (!session) {
        await recordSessionFailure('invalid_cookie');
        return null;
      }

      if (session.revokedAt) {
        await recordSessionFailure('revoked_session', session.userId);
        return null;
      }

      const now = sessionTiming.clock();

      if (!session.expiresAt) {
        await revokeSession(sessionId, now);
        await recordSessionFailure('expired_session', session.userId);
        return null;
      }

      if (session.expiresAt.getTime() <= now.getTime()) {
        await revokeSession(sessionId, now);
        await recordSessionFailure('expired_session', session.userId);
        return null;
      }

      const activityAt = sessionActivityAt(session);
      if (activityAt && activityAt.getTime() + sessionTiming.idleTtlMs <= now.getTime()) {
        await revokeSession(sessionId, now);
        await recordSessionFailure('idle_timeout', session.userId);
        return null;
      }

      const sessionContext = await findActiveSessionUser(session.userId);

      if (!sessionContext) {
        const auditedUserId = await findSessionUserForAudit(session.userId);

        if (auditedUserId) {
          await recordSessionFailure('inactive_user', auditedUserId);
        }

        return null;
      }

      await touchSession(sessionId, now);
      return sessionContext;
    },

    async logout(sessionId, userId) {
      await revokeSession(sessionId);
      await recordAuditEvent({
        action: 'auth.logout',
        userId,
        result: 'success',
      });
    },

    async recordMissingSessionCookie() {
      await recordSessionFailure('missing_cookie');
    },
  };
}
