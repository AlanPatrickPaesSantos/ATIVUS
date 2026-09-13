import type { NextFunction, Request, RequestHandler, Response } from 'express';

import {
  AuthError,
  createSessionService,
  SESSION_COOKIE_NAME,
  type SessionContext,
  type SessionService,
} from '../auth/sessionService.js';

declare global {
  namespace Express {
    interface Request {
      sessionContext?: SessionContext;
      sessionId?: string;
    }
  }
}

function readCookie(headerValue: string | undefined, cookieName: string): string | null {
  if (!headerValue) {
    return null;
  }

  for (const fragment of headerValue.split(';')) {
    const trimmed = fragment.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);

    if (name === cookieName && value) {
      return value;
    }
  }

  return null;
}

function unauthenticatedError() {
  return new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
}

function isPasswordChangeAllowedRequest(req: Request): boolean {
  const path = req.originalUrl.split('?')[0];

  return (
    (req.method === 'GET' && path === '/api/v1/session')
    || (req.method === 'POST' && path === '/api/v1/auth/password-change')
    || (req.method === 'POST' && path === '/api/v1/auth/logout')
  );
}

function passwordChangeRequiredError() {
  return new AuthError(403, 'PASSWORD_CHANGE_REQUIRED', 'Troca obrigatória de senha pendente.');
}

export function createRequireSession(sessionService: SessionService = createSessionService()): RequestHandler {
  return async function requireSession(req: Request, _res: Response, next: NextFunction) {
    try {
      const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);

      if (!sessionId) {
        await sessionService.recordMissingSessionCookie();
        throw unauthenticatedError();
      }

      const sessionContext = await sessionService.getSessionContext(sessionId);

      if (!sessionContext) {
        throw unauthenticatedError();
      }

      req.sessionId = sessionId;
      req.sessionContext = sessionContext;

      if (sessionContext.mustChangePassword && !isPasswordChangeAllowedRequest(req)) {
        throw passwordChangeRequiredError();
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
