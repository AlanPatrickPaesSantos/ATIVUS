import express, { type RequestHandler, type Router } from 'express';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { readOperationalMaintenanceWindow, setOperationalMaintenanceWindow } from '../repositories/operationalMaintenanceRepository.js';

function requireDitelAdmin(context: SessionContext | undefined): SessionContext {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Somente administradores DITEL podem controlar a janela operacional.');
  return context;
}

function parseReason(body: unknown): string {
  const reason = body && typeof body === 'object' && typeof (body as { reason?: unknown }).reason === 'string' ? (body as { reason: string }).reason.trim() : '';
  if (!reason || reason.length > 500) throw new AuthError(400, 'INVALID_OPERATIONAL_MAINTENANCE', 'A justificativa da janela operacional é obrigatória e deve ter até 500 caracteres.');
  return reason;
}

export function createOperationalMaintenanceRoutes(requireSessionMiddleware: RequestHandler): Router {
  const router = express.Router();
  router.get('/admin/operational-maintenance', requireSessionMiddleware, async (req, res, next) => { try { requireDitelAdmin(req.sessionContext); res.json(await readOperationalMaintenanceWindow()); } catch (error) { next(error); } });
  router.patch('/admin/operational-maintenance', requireSessionMiddleware, async (req, res, next) => {
    try {
      const session = requireDitelAdmin(req.sessionContext);
      if (typeof req.body?.active !== 'boolean') throw new AuthError(400, 'INVALID_OPERATIONAL_MAINTENANCE', 'O estado da janela operacional é inválido.');
      const result = await runInTransaction(async (transaction) => {
        const state = await setOperationalMaintenanceWindow({ active: req.body.active, actorId: session.userId, reason: parseReason(req.body) }, transaction);
        await recordAuditEvent({ action: req.body.active ? 'operational-maintenance.activate' : 'operational-maintenance.deactivate', module: 'operations', userId: session.userId, actor: { id: session.userId, name: session.name, registration: session.registration, role: session.role }, entity: { type: 'operational-maintenance-window', id: 'patrimonial-writes', label: 'Movimentações patrimoniais' }, unit: null, result: 'success', after: { active: state.active, reason: state.reason, revision: state.revision }, session: transaction });
        return state;
      });
      res.json(result);
    } catch (error) { next(error); }
  });
  return router;
}
