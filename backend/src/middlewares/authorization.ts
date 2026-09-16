import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import type { UnitReference } from '../models/User.js';

export interface DashboardAccessScope {
  unit: UnitReference;
  unitId: string | null;
  role: 'unit_user' | 'ditel_admin';
}

export const STATEWIDE_DASHBOARD_UNIT: UnitReference = {
  id: 'statewide',
  name: 'Estado do Pará',
  acronym: 'DITEL',
};

declare global {
  namespace Express {
    interface Request {
      dashboardScope?: DashboardAccessScope;
    }
  }
}

async function resolveDashboardScope(sessionContext: SessionContext | undefined): Promise<DashboardAccessScope> {
  if (!sessionContext) {
    throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  }

  const access = await resolveAccessScopeFromContext(sessionContext);

  if (!access) {
    throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
  }

  if (access.role === 'ditel_admin') {
    return {
      unit: STATEWIDE_DASHBOARD_UNIT,
      unitId: null,
      role: access.role,
    };
  }

  return {
    unit: access.unit,
    unitId: access.unitId,
    role: access.role,
  };
}

export const requireDashboardScope: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  void (async () => {
    try {
      req.dashboardScope = await resolveDashboardScope(req.sessionContext);
      next();
    } catch (error) {
      next(error);
    }
  })();
};
