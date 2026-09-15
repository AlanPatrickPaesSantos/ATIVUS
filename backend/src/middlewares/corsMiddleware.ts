import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { OriginProtectionOptions } from '../auth/securityOptions.js';

const ALLOWED_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type';

function requestOrigin(req: Request): string | null {
  if (typeof req.headers.origin === 'string' && req.headers.origin.trim().length > 0) {
    return req.headers.origin.trim();
  }

  return null;
}

function applyCorsHeaders(req: Request, res: Response, allowedOrigins: string[]): void {
  const origin = requestOrigin(req);

  if (!origin) {
    return;
  }

  if (!allowedOrigins.includes(origin)) {
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', appendVary(res.getHeader('Vary'), 'Origin'));
}

function appendVary(current: unknown, value: string): string {
  const existing = typeof current === 'string' && current.trim().length > 0 ? current : '';
  return existing.length > 0 ? `${existing}, ${value}` : value;
}

export function createCorsMiddleware(options: OriginProtectionOptions): RequestHandler {
  return function corsMiddleware(req: Request, res: Response, next: NextFunction) {
    const allowedOrigins = options.allowedOrigins;

    if (req.method === 'OPTIONS') {
      const origin = requestOrigin(req);

      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        res.setHeader('Vary', appendVary(res.getHeader('Vary'), 'Origin'));
        res.status(204).end();
        return;
      }

      res.status(204).end();
      return;
    }

    applyCorsHeaders(req, res, allowedOrigins);
    next();
  };
}