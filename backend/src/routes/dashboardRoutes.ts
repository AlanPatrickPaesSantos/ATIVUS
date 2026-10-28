import { Router, type RequestHandler } from 'express';

import { requireDashboardScope } from '../middlewares/authorization.js';
import { readDashboardByScope } from '../repositories/equipmentReadRepository.js';
import type { EquipmentFilterInput } from '../repositories/equipmentQueryFilters.js';
import { AuthError } from '../auth/sessionService.js';

export interface CreateDashboardRoutesOptions {
  requireSession: RequestHandler;
}

function parseDashboardFilters(req: Parameters<RequestHandler>[0]): EquipmentFilterInput {
  const value = (name: string) => typeof req.query[name] === 'string' && req.query[name].trim() ? req.query[name].trim() : undefined;
  const situation = value('situation');
  if (situation && !['active', 'maintenance', 'inactive', 'lost', 'written_off', 'attention'].includes(situation)) throw new AuthError(400, 'INVALID_QUERY', 'Situação inválida.');
  const period = value('period');
  if (period && !['30d', '90d', '2026-08'].includes(period)) throw new AuthError(400, 'INVALID_QUERY', 'Período inválido.');
  return {
    unitId: value('unitId'),
    commandId: value('commandId'),
    situation: situation as EquipmentFilterInput['situation'],
    municipality: value('municipality'),
    region: value('region'),
    type: value('type'),
    model: value('model'),
    section: value('section'),
    period: period as EquipmentFilterInput['period'],
  };
}

export function createDashboardRoutes(options: CreateDashboardRoutesOptions) {
  const router = Router();

  router.get('/dashboard', options.requireSession, requireDashboardScope, async (req, res, next) => {
    try {
      const response = await readDashboardByScope(req.dashboardScope as NonNullable<typeof req.dashboardScope>, parseDashboardFilters(req));

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
