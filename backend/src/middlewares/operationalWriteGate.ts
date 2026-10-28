import type { RequestHandler } from 'express';

import { AuthError } from '../auth/sessionService.js';
import { readOperationalMaintenanceWindow } from '../repositories/operationalMaintenanceRepository.js';

export const requireOperationalWritesOpen: RequestHandler = async (_req, _res, next) => {
  try {
    if ((await readOperationalMaintenanceWindow()).active) {
      next(new AuthError(503, 'OPERATIONAL_MAINTENANCE_ACTIVE', 'Operações patrimoniais temporariamente bloqueadas para manutenção.'));
      return;
    }
    next();
  } catch {
    next(new AuthError(503, 'OPERATIONAL_MAINTENANCE_UNAVAILABLE', 'Não foi possível verificar a janela operacional.'));
  }
};
