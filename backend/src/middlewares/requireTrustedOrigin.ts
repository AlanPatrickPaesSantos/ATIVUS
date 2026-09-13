import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AuthError, SESSION_COOKIE_NAME } from '../auth/sessionService.js';
import type { OriginProtectionOptions } from '../auth/securityOptions.js';

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

function requestOrigin(req: Request): string | null {
  if (typeof req.headers.origin === 'string' && req.headers.origin.trim().length > 0) {
    return req.headers.origin.trim();
  }

  if (typeof req.headers.referer === 'string' && req.headers.referer.trim().length > 0) {
    try {
      return new URL(req.headers.referer).origin;
    } catch {
      return '__invalid__';
    }
  }

  return null;
}

function sameOrigin(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

function isMutatingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function createRequireTrustedOrigin(options: OriginProtectionOptions): RequestHandler {
  return function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
    if (!isMutatingMethod(req.method) || !readCookie(req.headers.cookie, SESSION_COOKIE_NAME)) {
      next();
      return;
    }

    const origin = requestOrigin(req);

    if (!origin) {
      next();
      return;
    }

    const allowedOrigins = options.allowedOrigins.length > 0
      ? options.allowedOrigins
      : [sameOrigin(req)];

    if (!allowedOrigins.includes(origin)) {
      next(new AuthError(403, 'INVALID_ORIGIN', 'Origem da requisição não permitida.'));
      return;
    }

    next();
  };
}
