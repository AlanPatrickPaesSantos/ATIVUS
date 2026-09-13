import express, { type RequestHandler, type Router } from 'express';
import mongoose from 'mongoose';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { isValidUnitReference } from '../models/User.js';
import { EquipmentModel } from '../models/Equipment.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { findActiveUnitReference } from '../repositories/unitsRepository.js';
import { createMovement, decideMovement, listMovements, movementExists } from '../repositories/movementsRepository.js';
async function access(context: SessionContext | undefined) { if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.'); const access = await resolveAccessScopeFromContext(context); if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.'); return access; }
function value(req: express.Request, key: string) { return typeof req.body?.[key] === 'string' ? req.body[key].trim() : ''; }
async function createMovementWithAudit(
  userId: string,
  input: Parameters<typeof createMovement>[0],
) {
  return runInTransaction(async (session) => {
    const result = await createMovement(input, session);
    await recordAuditEvent({ action: 'movements.create', userId, result: 'success', session });
    return result;
  });
}
async function decideMovementWithAudit(
  userId: string,
  input: Parameters<typeof decideMovement>[0],
) {
  return runInTransaction(async (session) => {
    const result = await decideMovement(input, session);
    if (!result) return null;
    await recordAuditEvent({ action: 'movements.decision', userId, result: 'success', session });
    return result;
  });
}
export function createMovementRoutes(requireSession: RequestHandler): Router { const router = express.Router();
  router.get('/movements', requireSession, async (req, res, next) => { try { res.json(await listMovements(await access(req.sessionContext))); } catch (e) { next(e); } });
  router.post('/movements', requireSession, async (req, res, next) => { try { const c = req.sessionContext; const a = await access(c); if (a.role !== 'unit_user') throw new AuthError(403, 'FORBIDDEN', 'Somente usuários de unidade podem solicitar transferências.'); const equipmentId = value(req, 'equipmentId'); const destination = req.body?.destination; if (!mongoose.isValidObjectId(equipmentId) || !isValidUnitReference(destination) || destination.id === a.unitId) throw new AuthError(400, 'INVALID_MOVEMENT', 'Dados da transferência inválidos.'); const canonicalDestination = await findActiveUnitReference(destination.id); if (!canonicalDestination) throw new AuthError(400, 'INVALID_MOVEMENT', 'Dados da transferência inválidos.'); if (!(await EquipmentModel.exists({ _id: equipmentId, 'unit.id': a.unitId }))) throw new AuthError(404, 'NOT_FOUND', 'Equipamento não encontrado.'); const result = await createMovementWithAudit(c!.userId, { equipmentId, origin: a.unit, destination: canonicalDestination, requestedBy: c!.userId }); res.status(201).json(result); } catch (e: any) { if (e?.code === 11000) { next(new AuthError(409, 'CONFLICT', 'Não foi possível criar a solicitação de transferência.')); return; } next(e); } });
  router.patch('/movements/:id/decision', requireSession, async (req, res, next) => { try { const c = req.sessionContext; const a = await access(c); if (a.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Somente DITEL pode decidir transferências.'); const status = value(req, 'status'); const updatedAt = new Date(value(req, 'updatedAt')); const reason = value(req, 'reason'); if (!['Aprovada', 'Rejeitada'].includes(status) || Number.isNaN(updatedAt.getTime()) || (status === 'Rejeitada' && !reason)) throw new AuthError(400, 'INVALID_MOVEMENT', 'Decisão inválida.'); if (!mongoose.isValidObjectId(req.params.id) || !(await movementExists(req.params.id))) throw new AuthError(404, 'NOT_FOUND', 'Movimentação não encontrada.'); const result = await decideMovementWithAudit(c!.userId, { id: req.params.id, updatedAt, status: status as 'Aprovada' | 'Rejeitada', ...(reason ? { reason } : {}), decidedBy: c!.userId }); if (!result) throw new AuthError(409, 'CONFLICT', 'A movimentação já foi decidida ou está desatualizada.'); res.json(result); } catch (e) { next(e); } }); return router; }
