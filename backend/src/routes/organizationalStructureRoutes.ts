import express, { type RequestHandler, type Router } from 'express';

import { AuthError } from '../auth/sessionService.js';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { getOrganizationalFilterOptions, getOrganizationalNode, listOrganizationalUnits, parseOrganizationalStructureQuery } from '../repositories/organizationalStructureRepository.js';
import { readOrganizationalIndicators } from '../repositories/organizationalIndicatorsRepository.js';

export function assertDitelAdmin(context: Parameters<RequestHandler>[0]['sessionContext']): void {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
}

export function createOrganizationalStructureRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();

  router.get('/organizational-options', requireSession, (req, res, next) => {
    try {
      const context = req.sessionContext;
      if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
      if (context.role !== 'ditel_admin' && context.role !== 'unit_user') throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
      void resolveAccessScopeFromContext(context).then((access) => {
        if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
        return getOrganizationalFilterOptions({ role: access.role, unitId: access.unitId });
      }).then((result) => res.status(200).json(result)).catch(next);
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/organizational-structure', requireSession, (req, res, next) => {
    try {
      assertDitelAdmin(req.sessionContext);
      const parsed = parseOrganizationalStructureQuery(req.query as Record<string, unknown>);
      void listOrganizationalUnits(parsed.filters, parsed).then((result) => res.status(200).json(result)).catch(next);
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/organizational-structure/:organizationId', requireSession, (req, res, next) => {
    try {
      assertDitelAdmin(req.sessionContext);
      void Promise.all([getOrganizationalNode(req.params.organizationId), readOrganizationalIndicators(req.params.organizationId)]).then(([result, indicators]) => {
        if (!result) { res.status(404).json({ code: 'NOT_FOUND', message: 'Organização não encontrada.' }); return; }
        res.status(200).json({ ...result, indicators: indicators.indicators });
      }).catch(next);
    } catch (error) {
      next(error);
    }
  });

  router.get('/admin/organizational-structure/:organizationId/indicators', requireSession, (req, res, next) => {
    try {
      assertDitelAdmin(req.sessionContext);
      void readOrganizationalIndicators(req.params.organizationId).then((result) => res.status(200).json(result)).catch(next);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
