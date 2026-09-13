import type { RequestHandler, Router } from 'express';
import express from 'express';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { runInTransaction } from '../database/transaction.js';
import { createAttachmentUpload } from '../middlewares/attachmentUpload.js';
import { createEquipment, readEquipmentDetails, readInventory, updateEquipmentSituation, findEquipmentAuditRecord, type InventoryFilters } from '../repositories/equipmentReadRepository.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { cleanupStoredAttachments, storeUploadedAttachments, type AttachmentMetadata } from '../services/attachments.js';
import mongoose from 'mongoose';

const equipmentCreateFields = new Set([
  'patrimony',
  'section',
  'type',
  'model',
  'serialNumber',
  'brand',
  'category',
  'hasWarranty',
  'warrantyDate',
  'situation',
  'location',
  'observations',
  'attachments',
]);

async function scope(context: SessionContext | undefined) {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  const access = await resolveAccessScopeFromContext(context);
  if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
  return access;
}
async function createEquipmentWithAudit(
  context: SessionContext,
  input: Parameters<typeof createEquipment>[0],
) {
  return runInTransaction(async (session) => {
    const created = await createEquipment(input, session);
    await recordAuditEvent({ action: 'equipment.create', userId: context.userId, result: 'success', session });
    return created;
  });
}
function query(req: Parameters<RequestHandler>[0]): { filters: InventoryFilters; page: number; pageSize: number } {
  const number = (value: unknown, fallback: number) => value === undefined ? fallback : Number(value);
  const page = number(req.query.page, 1); const pageSize = number(req.query.pageSize, 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
  const situation = req.query.situation as string | undefined;
  if (situation && !['active', 'maintenance', 'inactive', 'lost', 'written_off'].includes(situation)) throw new AuthError(400, 'INVALID_QUERY', 'Situação inválida.');
  const stringValue = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : undefined;
  return { page, pageSize, filters: { search: stringValue(req.query.search), type: stringValue(req.query.type), model: stringValue(req.query.model), situation: situation as InventoryFilters['situation'], unitId: stringValue(req.query.unitId) } };
}
function actorFromContext(context: SessionContext | undefined) {
  return context ? { id: context.userId, name: context.name, registration: context.registration, role: context.role } : null;
}
async function updateEquipmentSituationWithAudit(
  context: SessionContext,
  input: Parameters<typeof updateEquipmentSituation>[0],
  scope: Parameters<typeof updateEquipmentSituation>[1],
) {
  return runInTransaction(async (session) => {
    const before = await findEquipmentAuditRecord(input.equipmentId, scope, session);
    if (!before) throw new AuthError(404, 'NOT_FOUND', 'Equipamento não encontrado.');
    if (before.updatedAt.getTime() !== input.updatedAt.getTime()) return null;
    const updated = await updateEquipmentSituation(input, scope, session);
    if (!updated) return null;
    await recordAuditEvent({
      action: 'equipment.situation.update',
      module: 'inventory',
      userId: context.userId,
      actor: actorFromContext(context),
      entity: { type: 'equipment', id: before.id, label: before.patrimony },
      unit: before.unit,
      result: 'success',
      before: { situation: before.situation },
      after: { situation: updated.situation },
      session,
    });
    return updated;
  });
}
function hasUnknownEquipmentCreateField(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => !equipmentCreateFields.has(key));
}
export function createInventoryRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();
  const uploadAttachments = createAttachmentUpload({ maxFileSizeBytes: 15 * 1024 * 1024, maxFileSizeLabel: '15 MiB', maxParts: 32 });
  router.post('/inventory', requireSession, uploadAttachments, async (req, res, next) => {
    let attachments: AttachmentMetadata[] = [];
    try {
    const context = req.sessionContext;
    if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
    const access = await scope(context);
    if (access.role !== 'unit_user') throw new AuthError(403, 'FORBIDDEN', 'Apenas usuários de unidade podem cadastrar equipamentos.');
    const body = req.body as Record<string, string>; const required = ['patrimony','type','model','brand','situation','location'];
    if (hasUnknownEquipmentCreateField(body)) throw new AuthError(400, 'INVALID_EQUIPMENT', 'Dados do equipamento inválidos.');
    if (required.some((key) => typeof body[key] !== 'string' || !body[key].trim()) || !['active','maintenance','inactive','lost','written_off'].includes(body.situation)) throw new AuthError(400, 'INVALID_EQUIPMENT', 'Dados do equipamento inválidos.');
    attachments = await storeUploadedAttachments('equipment', req.files as Express.Multer.File[] | undefined);
    const created = await createEquipmentWithAudit(context, { patrimony: body.patrimony.trim(), type: body.type.trim(), model: body.model.trim(), brand: body.brand.trim(), situation: body.situation as any, location: body.location.trim(), category: body.category?.trim() || 'Não classificado', ...(body.serialNumber ? { serialNumber: body.serialNumber.trim() } : {}), ...(body.warrantyDate && body.hasWarranty === 'yes' ? { warranty: body.warrantyDate } : {}), ...(body.observations ? { observations: body.observations.trim() } : {}), unit: access.unit, createdBy: context.userId, attachments });
    res.status(201).json(created);
  } catch (error: any) {
    if (attachments.length) await cleanupStoredAttachments(attachments);
    if (error?.code === 11000) { next(new AuthError(409, 'DUPLICATE_PATRIMONY', 'Patrimônio já cadastrado.')); return; }
    next(error);
  } });
  router.get('/inventory', requireSession, async (req, res, next) => { try { const accessScope = await scope(req.sessionContext); const parsed = query(req); res.json(await readInventory(parsed.filters, accessScope, parsed.page, parsed.pageSize)); } catch (error) { next(error); } });
  router.get('/inventory/:equipmentId', requireSession, async (req, res, next) => { try { const result = await readEquipmentDetails(req.params.equipmentId, {}, await scope(req.sessionContext)); if (!result) { res.status(404).json({ code: 'NOT_FOUND', message: 'Equipamento não encontrado.' }); return; } res.json(result); } catch (error) { next(error); } });
  router.patch('/inventory/:equipmentId', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext as SessionContext | undefined;
      if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
      const access = await scope(context);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowed = new Set(['situation', 'updatedAt']);
      const hasUnknown = Object.keys(body).some((key) => !allowed.has(key));
      const situation = typeof body.situation === 'string' ? body.situation.trim() : '';
      const updatedAtRaw = typeof body.updatedAt === 'string' ? body.updatedAt : '';
      const updatedAt = new Date(updatedAtRaw);
      const validSituations = ['active', 'maintenance', 'inactive', 'lost', 'written_off'];
      if (hasUnknown || !validSituations.includes(situation) || !updatedAtRaw || Number.isNaN(updatedAt.getTime())) {
        throw new AuthError(400, 'INVALID_EQUIPMENT', 'Dados de atualização inválidos.');
      }
      if (!mongoose.isValidObjectId(req.params.equipmentId)) throw new AuthError(404, 'NOT_FOUND', 'Equipamento não encontrado.');
      const updated = await updateEquipmentSituationWithAudit(context, {
        equipmentId: req.params.equipmentId,
        situation: situation as any,
        updatedAt,
        updatedBy: context.userId,
      }, { role: access.role, unitId: access.unitId });
      if (!updated) throw new AuthError(409, 'EQUIPMENT_CONFLICT', 'Equipamento alterado por outra operação. Recarregue os dados e tente novamente.');
      res.json(updated);
    } catch (error) { next(error); }
  });
  return router;
}
