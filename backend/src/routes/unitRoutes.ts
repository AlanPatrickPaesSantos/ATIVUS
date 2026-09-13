import express, { type RequestHandler, type Router } from 'express';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { listActiveUnits } from '../repositories/unitsRepository.js';

async function resolveScope(context: SessionContext | undefined): Promise<string | undefined> {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role === 'ditel_admin') return undefined;
  const access = await resolveAccessScopeFromContext(context);
  if (!access || access.role !== 'unit_user') {
    throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
  }
  return access.unitId;
}

export function createUnitRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();
  router.get('/units', requireSession, async (req, res, next) => {
    try {
      res.json(await listActiveUnits(await resolveScope(req.sessionContext)));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
