import { Router, type CookieOptions, type RequestHandler } from 'express';
import mongoose from 'mongoose';

import {
  AuthError,
  SESSION_COOKIE_NAME,
  type SessionService,
} from '../auth/sessionService.js';
import type { LoginAttempt, LoginRateLimiter, ReservedLoginAttempt } from '../auth/loginRateLimiter.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { changeOwnPasswordAfterRequiredReset } from '../repositories/usersRepository.js';

export interface CreateAuthRoutesOptions {
  loginRateLimiter: LoginRateLimiter;
  requireSession: RequestHandler;
  sessionCookieSecure: boolean;
  sessionService: SessionService;
}

function buildSessionCookieOptions(sessionCookieSecure: boolean): CookieOptions {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: sessionCookieSecure,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requestedNewPassword(body: unknown): string {
  if (!isRecord(body)) {
    throw new AuthError(400, 'INVALID_PASSWORD_CHANGE', 'Dados de troca de senha inválidos.');
  }

  const allowed = new Set(['newPassword']);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new AuthError(400, 'INVALID_PASSWORD_CHANGE', 'Dados de troca de senha inválidos.');
  }

  const newPassword = body.newPassword;
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new AuthError(400, 'INVALID_PASSWORD_CHANGE', 'Dados de troca de senha inválidos.');
  }

  return newPassword;
}

function unlockedSessionContext(context: NonNullable<Express.Request['sessionContext']>) {
  const { mustChangePassword: _mustChangePassword, ...sessionContext } = context;
  return sessionContext;
}

export function createAuthRoutes(options: CreateAuthRoutesOptions) {
  const router = Router();
  const sessionCookieOptions = buildSessionCookieOptions(options.sessionCookieSecure);

  router.post('/auth/login', async (req, res, next) => {
    const registration = typeof req.body?.registration === 'string' ? req.body.registration : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const attempt: LoginAttempt = {
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      registration: registration.trim(),
    };

    const reservation = await options.loginRateLimiter.reserve(attempt);

    if (!reservation) {
      await recordAuditEvent({
        action: 'auth.login',
        userId: null,
        result: 'failure',
        reason: 'rate_limited',
      });
      next(new AuthError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas de login. Tente novamente mais tarde.'));
      return;
    }

    try {
      const { sessionId, context } = await options.sessionService.login(registration, password);
      await options.loginRateLimiter.recordSuccess(reservation);

      res.cookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions);
      res.status(200).json(context);
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === 'INVALID_CREDENTIALS') {
          await options.loginRateLimiter.recordFailure(reservation);
        } else {
          await options.loginRateLimiter.release(reservation);
        }
      } else {
        await options.loginRateLimiter.release(reservation);
      }
      next(error);
    }
  });

  router.get('/session', options.requireSession, (req, res) => {
    res.status(200).json(req.sessionContext);
  });

  router.post('/auth/password-change', options.requireSession, async (req, res, next) => {
    try {
      const newPassword = requestedNewPassword(req.body);
      const context = req.sessionContext;

      if (!context?.mustChangePassword) {
        throw new AuthError(409, 'PASSWORD_CHANGE_NOT_REQUIRED', 'Troca obrigatória de senha não está pendente.');
      }

      const session = await mongoose.startSession();
      let changed = false;

      try {
        await session.withTransaction(async () => {
          const result = await changeOwnPasswordAfterRequiredReset(context.userId, newPassword, session);

          if (!result) {
            return;
          }

          changed = true;

          await recordAuditEvent({
            action: 'auth.credential_change',
            module: 'auth',
            userId: context.userId,
            actor: {
              id: context.userId,
              name: context.name,
              registration: context.registration,
              role: context.role,
            },
            unit: context.unit,
            result: 'success',
            before: { requiresCredentialChange: result.previousMustChangePassword },
            after: { requiresCredentialChange: false },
            session,
          });
        });
      } finally {
        await session.endSession();
      }

      if (!changed) {
        throw new AuthError(409, 'PASSWORD_CHANGE_NOT_REQUIRED', 'Troca obrigatória de senha não está pendente.');
      }

      res.status(200).json(unlockedSessionContext(context));
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/logout', options.requireSession, async (req, res, next) => {
    try {
      await options.sessionService.logout(req.sessionId as string, req.sessionContext?.userId as string);

      res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
