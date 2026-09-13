import { Router, type RequestHandler } from 'express';

import { requireDashboardScope } from '../middlewares/authorization.js';
import { readDashboardByScope } from '../repositories/equipmentReadRepository.js';

export interface CreateDashboardRoutesOptions {
  requireSession: RequestHandler;
}

export function createDashboardRoutes(options: CreateDashboardRoutesOptions) {
  const router = Router();

  router.get('/dashboard', options.requireSession, requireDashboardScope, async (req, res, next) => {
    try {
      const response = await readDashboardByScope(req.dashboardScope as NonNullable<typeof req.dashboardScope>);

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
