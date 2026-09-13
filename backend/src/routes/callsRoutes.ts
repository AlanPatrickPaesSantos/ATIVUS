import express, { type RequestHandler, type Router } from 'express';
import mongoose from 'mongoose';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { createAttachmentUpload } from '../middlewares/attachmentUpload.js';
import { CALL_PRIORITY_INPUTS, CALL_PRIORITY_LABELS, CALL_PROBLEMS, TRIAGE_STATUSES } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { callExists, createCall, findCallAuditRecord, getCallDetails, listCalls, updateCallTriage, type CallAuditRecord } from '../repositories/callsRepository.js';
import { cleanupStoredAttachments, storeUploadedAttachments, type AttachmentMetadata } from '../services/attachments.js';

const uploadAttachments = createAttachmentUpload({ maxFileSizeBytes: 10 * 1024 * 1024, maxFileSizeLabel: '10 MiB', maxParts: 16 });
async function scope(context: SessionContext | undefined) { if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.'); const access = await resolveAccessScopeFromContext(context); if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.'); return access; }
function field(req: express.Request, name: string) { const value = req.body?.[name]; return typeof value === 'string' ? value.trim() : ''; }
function queueItem(document: any) { return { id: String(document._id), subject: document.subject, unitId: document.unit.id, unitName: document.unit.name, priority: document.priority, status: document.status, section: document.section, updatedAt: document.updatedAt.toISOString() }; }
function actorFromContext(context: SessionContext | undefined) { return context ? { id: context.userId, name: context.name, registration: context.registration, role: context.role } : null; }
function triageSnapshot(call: Pick<CallAuditRecord, 'status' | 'priority' | 'section'>) { return { status: call.status, priority: call.priority, section: call.section }; }
function isClosedPayload(req: express.Request, allowed: readonly string[]) { return Boolean(req.body) && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).every((key) => allowed.includes(key)); }
async function createCallWithAudit(
  context: SessionContext,
  input: Parameters<typeof createCall>[0],
) {
  return runInTransaction(async (session) => {
    const result = await createCall(input, session);
    await recordAuditEvent({ action: 'calls.create', userId: context.userId, result: 'success', session });
    return result;
  });
}
async function updateCallTriageWithAudit(
  context: SessionContext,
  input: Parameters<typeof updateCallTriage>[0],
) {
  return runInTransaction(async (session) => {
    const before = await findCallAuditRecord(input.callId, session);
    if (!before) throw new AuthError(404, 'NOT_FOUND', 'Chamado não encontrado.');
    if (before.updatedAt.getTime() !== input.updatedAt.getTime()) return null;
    const updated = await updateCallTriage(input, session);
    if (!updated) return null;
    await recordAuditEvent({
      action: 'calls.triage',
      module: 'calls',
      userId: context.userId,
      actor: actorFromContext(context),
      entity: { type: 'call', id: before.id, label: before.protocol },
      unit: before.unit,
      result: 'success',
      before: triageSnapshot(before),
      after: triageSnapshot({ status: updated.status, priority: updated.priority, section: updated.section }),
      session,
    });
    return updated;
  });
}
export function createCallsRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();
  router.get('/calls', requireSession, async (req, res, next) => { try { res.json(await listCalls(await scope(req.sessionContext))); } catch (e) { next(e); } });
  router.get('/calls/:callId', requireSession, async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.callId)) throw new AuthError(404, 'NOT_FOUND', 'Chamado não encontrado.'); const details = await getCallDetails(await scope(req.sessionContext), req.params.callId); if (!details) throw new AuthError(404, 'NOT_FOUND', 'Chamado não encontrado.'); res.json(details); } catch (e) { next(e); } });
  router.post('/calls', requireSession, uploadAttachments, async (req, res, next) => {
    let attachments: AttachmentMetadata[] = [];
    try {
      const context = req.sessionContext;
      if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
      const access = await scope(context);
      if (access.role === 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Administradores DITEL não podem abrir chamados nesta etapa.');
      const problem = field(req, 'problem'); const priority = field(req, 'priority'); const subject = field(req, 'subject'); const description = field(req, 'description'); const equipmentId = field(req, 'equipmentId');
      if (!(CALL_PROBLEMS as readonly string[]).includes(problem) || !(CALL_PRIORITY_INPUTS as readonly string[]).includes(priority) || !subject || subject.length > 120 || !description) throw new AuthError(400, 'INVALID_CALL', 'Dados do chamado inválidos.');
      if (equipmentId && !mongoose.isValidObjectId(equipmentId)) throw new AuthError(400, 'INVALID_CALL', 'Equipamento inválido.');
      if (equipmentId && !(await EquipmentModel.exists({ _id: equipmentId, 'unit.id': access.unitId }))) throw new AuthError(404, 'NOT_FOUND', 'Equipamento não encontrado.');
      attachments = await storeUploadedAttachments('call', req.files as Express.Multer.File[] | undefined);
      const result = await createCallWithAudit(context, { problem: problem as any, priority: CALL_PRIORITY_LABELS[priority as keyof typeof CALL_PRIORITY_LABELS], subject, description, ...(equipmentId ? { equipmentId } : {}), unit: access.unit, createdBy: context.userId, attachments });
      res.status(201).json(result);
    } catch (e) { if (attachments.length) await cleanupStoredAttachments(attachments); next(e); }
  });
  router.patch('/calls/:callId/triage', requireSession, async (req, res, next) => { try { const context = req.sessionContext; if (!context || context.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Somente administradores DITEL podem triar chamados.'); const status = field(req, 'status'); const priority = field(req, 'priority'); const section = field(req, 'section'); const updatedAtRaw = field(req, 'updatedAt'); const updatedAt = new Date(updatedAtRaw); if (!isClosedPayload(req, ['status', 'priority', 'section', 'updatedAt']) || !(TRIAGE_STATUSES as readonly string[]).includes(status) || !(CALL_PRIORITY_INPUTS as readonly string[]).includes(priority) || !['Suporte', 'Telecom'].includes(section) || !updatedAtRaw || Number.isNaN(updatedAt.getTime())) throw new AuthError(400, 'INVALID_TRIAGE', 'Dados de triagem inválidos.'); if (!mongoose.isValidObjectId(req.params.callId) || !(await callExists(req.params.callId))) throw new AuthError(404, 'NOT_FOUND', 'Chamado não encontrado.'); const updated = await updateCallTriageWithAudit(context, { callId: req.params.callId, updatedAt, status: status as any, priority: CALL_PRIORITY_LABELS[priority as keyof typeof CALL_PRIORITY_LABELS], section: section as any, updatedBy: context.userId }); if (!updated) { await recordAuditEvent({ action: 'calls.triage', module: 'calls', userId: context.userId, actor: actorFromContext(context), result: 'failure' }); throw new AuthError(409, 'USER_CONFLICT', 'O chamado foi alterado por outra operação. Recarregue os dados e tente novamente.'); } res.json(queueItem(updated)); } catch (e) { next(e); } });
  return router;
}
