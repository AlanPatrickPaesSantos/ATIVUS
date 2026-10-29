import express, { type RequestHandler, type Router } from 'express';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { PENDING_SOURCES, listPendingOperations, type PendingQuery, type PendingSource } from '../repositories/pendingOperationsRepository.js';

function value(query: Record<string, unknown>, name: string) {
  return typeof query[name] === 'string' && query[name].trim() ? query[name].trim() : undefined;
}

function parsePositive(valueToParse: string | undefined, fallback: number) {
  if (valueToParse === undefined) return fallback;
  const parsed = Number(valueToParse);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function parseQuery(query: Record<string, unknown>): PendingQuery {
  const page = parsePositive(value(query, 'page'), 1);
  const pageSize = parsePositive(value(query, 'pageSize'), 20);
  const source = value(query, 'source');
  if (!Number.isInteger(page) || !Number.isInteger(pageSize) || (source && !(PENDING_SOURCES as readonly string[]).includes(source))) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de pendências inválidos.');
  return { page, pageSize, ...(source ? { source: source as PendingSource } : {}), ...(value(query, 'state') ? { state: value(query, 'state') } : {}), ...(value(query, 'priority') ? { priority: value(query, 'priority') } : {}), ...(value(query, 'unitId') ? { unitId: value(query, 'unitId') } : {}), ...(value(query, 'search') ? { search: value(query, 'search') } : {}) };
}

function scopeFor(context: SessionContext | undefined) {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role === 'ac_operator') return { role: context.role, unitId: null } as const;
  return resolveAccessScopeFromContext(context).then((access) => {
    if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
    return access;
  });
}

export function createPendingRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();
  router.get('/pending-operations', requireSession, async (req, res, next) => {
    try {
      const query = parseQuery(req.query as Record<string, unknown>);
      const scope = await scopeFor(req.sessionContext);
      const result = await listPendingOperations(query, scope);
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'PAGINATION_TOO_DEEP') return next(new AuthError(400, 'INVALID_QUERY', 'A página solicitada excede o limite de consulta.'));
      next(error);
    }
  });
  return router;
}
