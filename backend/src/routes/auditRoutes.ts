import express, { type RequestHandler, type Router } from 'express';

import { AuthError } from '../auth/sessionService.js';
import { listAuditEvents, type AuditEventFilters } from '../repositories/auditRepository.js';

const results = new Set(['success', 'failure']);

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown, fallback: number): number {
  return value === undefined ? fallback : Number(value);
}

function date(value: unknown): Date | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AuthError(400, 'INVALID_QUERY', 'Período inválido.');
  }
  return parsed;
}

function parseQuery(req: Parameters<RequestHandler>[0]): { filters: AuditEventFilters; page: number; pageSize: number } {
  const page = number(req.query.page, 1);
  const pageSize = number(req.query.pageSize, 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
  }

  const result = text(req.query.result);
  if (result && !results.has(result)) {
    throw new AuthError(400, 'INVALID_QUERY', 'Resultado inválido.');
  }

  return {
    page,
    pageSize,
    filters: {
      action: text(req.query.action),
      module: text(req.query.module),
      result: result as AuditEventFilters['result'],
      userId: text(req.query.userId),
      unitId: text(req.query.unitId),
      entityType: text(req.query.entityType),
      entityId: text(req.query.entityId),
      from: date(req.query.from),
      to: date(req.query.to),
    },
  };
}

export function createAuditRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();

  router.get('/audit-events', requireSession, async (req, res, next) => {
    try {
      if (req.sessionContext?.role !== 'ditel_admin') {
        throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
      }

      const parsed = parseQuery(req);
      res.json(await listAuditEvents(parsed.filters, parsed.page, parsed.pageSize));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
