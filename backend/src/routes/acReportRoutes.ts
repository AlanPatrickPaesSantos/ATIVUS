import express, { type RequestHandler, type Router } from 'express';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { type EquipmentSituation } from '../models/Equipment.js';
import { readAcPatrimonialReport, type AcPatrimonialReportFilters } from '../repositories/acReportsRepository.js';

const SITUATIONS = ['active', 'maintenance', 'inactive', 'lost', 'written_off'] as const satisfies EquipmentSituation[];
const SORTS = ['distributedAt', 'patrimony', 'destinationUnit'] as const;
const ORDERS = ['asc', 'desc'] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireReader(context: SessionContext | undefined) {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role !== 'ac_operator' && context.role !== 'ditel_admin') {
    throw new AuthError(403, 'FORBIDDEN', 'Perfil sem acesso aos relatórios patrimoniais da AC.');
  }
  return context;
}

function optionalText(query: express.Request['query'], key: string, maxLength = 120) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new AuthError(400, 'INVALID_QUERY', `Parâmetro ${key} inválido.`);
  }
  return value.trim();
}

function parseQuery(query: express.Request['query']) {
  const filters: AcPatrimonialReportFilters = {};
  for (const key of ['from', 'to'] as const) {
    const value = optionalText(query, key, 10);
    if (value && !DATE_PATTERN.test(value)) throw new AuthError(400, 'INVALID_QUERY', 'Período inválido.');
    if (value) filters[key] = value;
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new AuthError(400, 'INVALID_QUERY', 'Período inválido.');
  for (const key of ['unitId', 'patrimony', 'type', 'model', 'bg'] as const) {
    const value = optionalText(query, key);
    if (value) filters[key] = value;
  }
  const situation = optionalText(query, 'situation');
  if (situation && !SITUATIONS.includes(situation as EquipmentSituation)) throw new AuthError(400, 'INVALID_QUERY', 'Situação inválida.');
  if (situation) filters.situation = situation as EquipmentSituation;

  const positiveInteger = (key: string, fallback: number) => {
    const value = query[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new AuthError(400, 'INVALID_QUERY', 'Paginação inválida.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new AuthError(400, 'INVALID_QUERY', 'Paginação inválida.');
    return parsed;
  };
  const page = positiveInteger('page', 1);
  const pageSize = positiveInteger('pageSize', 20);
  if (pageSize > 100) throw new AuthError(400, 'INVALID_QUERY', 'Paginação inválida.');
  const sort = optionalText(query, 'sort', 30) ?? 'distributedAt';
  const order = optionalText(query, 'order', 4) ?? 'desc';
  if (!SORTS.includes(sort as typeof SORTS[number]) || !ORDERS.includes(order as typeof ORDERS[number])) throw new AuthError(400, 'INVALID_QUERY', 'Ordenação inválida.');
  return { filters, page: { page, pageSize, sort: sort as typeof SORTS[number], order: order as typeof ORDERS[number] } };
}

export function createAcReportRoutes(requireSessionMiddleware: RequestHandler): Router {
  const router = express.Router();
  router.get('/ac/reports/patrimonial', requireSessionMiddleware, async (req, res, next) => {
    try {
      const context = requireReader(req.sessionContext);
      const query = parseQuery(req.query);
      const report = await readAcPatrimonialReport(query.filters, query.page);
      res.json({ ...report, generatedAt: new Date().toISOString(), generatedBy: { name: context.name, role: context.role } });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
