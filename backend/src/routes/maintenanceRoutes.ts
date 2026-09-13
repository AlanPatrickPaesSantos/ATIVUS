import mongoose from 'mongoose';
import { Router, type Request, type RequestHandler } from 'express';

import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { MaintenanceModel } from '../models/Maintenance.js';
import { runInTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import {
  createMaintenanceRecord,
  findMaintenanceCall,
  findMaintenanceEquipment,
  isMaintenanceStatus,
  listMaintenanceRecords,
  updateMaintenanceRecord,
  type MaintenanceCreateInput,
  type MaintenanceFilters,
} from '../repositories/maintenanceRepository.js';

const CREATE_FIELDS = ['equipmentId', 'description', 'status', 'type', 'callId'] as const;

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseFilters(query: Record<string, unknown>): MaintenanceFilters {
  const status = stringValue(query.status);
  const equipmentType = stringValue(query.equipmentType);
  const filters: MaintenanceFilters = {};

  if (status) {
    if (!isMaintenanceStatus(status)) {
      throw new AuthError(400, 'INVALID_QUERY', 'Situação de manutenção inválida.');
    }
    filters.status = status;
  }

  if (equipmentType) {
    filters.equipmentType = equipmentType;
  }

  return filters;
}

function field(req: Request, name: string) {
  const value = req.body?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

function isClosedPayload(req: Request, allowed: readonly string[]) {
  return Boolean(req.body)
    && typeof req.body === 'object'
    && !Array.isArray(req.body)
    && Object.keys(req.body).every((key) => allowed.includes(key));
}

function actorFromContext(context: SessionContext) {
  return { id: context.userId, name: context.name, registration: context.registration, role: context.role };
}

async function createMaintenanceWithAudit(context: SessionContext, input: MaintenanceCreateInput) {
  return runInTransaction(async (session) => {
    const equipment = await findMaintenanceEquipment(input.equipmentId, input.unit.id, session);
    if (!equipment) throw new AuthError(404, 'NOT_FOUND', 'Equipamento não encontrado.');
    if (!['active', 'maintenance'].includes(equipment.situation)) {
      throw new AuthError(409, 'INVALID_EQUIPMENT_SITUATION', 'A manutenção só pode ser aberta para equipamento ativo ou em manutenção.');
    }

    const call = input.callId ? await findMaintenanceCall(input.callId, input.unit.id, equipment.id, session) : null;
    if (input.callId && !call) throw new AuthError(404, 'NOT_FOUND', 'Chamado não encontrado.');

    const result = await createMaintenanceRecord(input, equipment, call ?? undefined, session);
    await recordAuditEvent({
      action: 'maintenance.create',
      module: 'maintenance',
      userId: context.userId,
      actor: actorFromContext(context),
      entity: { type: 'maintenance', id: result.id, label: equipment.patrimony },
      unit: input.unit,
      result: 'success',
      after: {
        status: input.status,
        type: input.type,
        equipmentId: equipment.id,
        ...(call ? { callId: call.id } : {}),
      },
      session,
    });

    return result;
  });
}

export function createMaintenanceRoutes(requireSession: RequestHandler) {
  const router = Router();

  router.get('/maintenance', requireSession, async (req, res, next) => {
    try {
      const access = await resolveAccessScopeFromContext(req.sessionContext);
      if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');

      const filters = parseFilters(req.query);
      res.status(200).json(await listMaintenanceRecords(filters, { role: access.role, unitId: access.unitId }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/maintenance', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');

      const access = await resolveAccessScopeFromContext(context);
      if (!access) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
      if (access.role !== 'unit_user') throw new AuthError(403, 'FORBIDDEN', 'Apenas usuários de unidade podem abrir manutenções.');

      const equipmentId = field(req, 'equipmentId');
      const description = field(req, 'description');
      const status = field(req, 'status');
      const type = field(req, 'type');
      const callId = field(req, 'callId');

      if (!isClosedPayload(req, CREATE_FIELDS)
        || !mongoose.isValidObjectId(equipmentId)
        || !description
        || !type
        || !isMaintenanceStatus(status)
        || (callId && !mongoose.isValidObjectId(callId))) {
        throw new AuthError(400, 'INVALID_MAINTENANCE', 'Dados de manutenção inválidos.');
      }

      const created = await createMaintenanceWithAudit(context, {
        equipmentId,
        description,
        status,
        type,
        unit: access.unit,
        ...(callId ? { callId } : {}),
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/maintenance/:maintenanceId', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
      if (context.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Apenas administradores DITEL podem atualizar manutenções.');
      const allowed = ['status', 'diagnosis', 'service', 'technicalResponsible', 'completedAt', 'observations', 'updatedAt'];
      if (!isClosedPayload(req, allowed) || !mongoose.isValidObjectId(req.params.maintenanceId)) throw new AuthError(400, 'INVALID_MAINTENANCE', 'Dados de manutenção inválidos.');
      const updatedAt = new Date(field(req, 'updatedAt')); const status = field(req, 'status'); const completedAtRaw = field(req, 'completedAt'); const completedAt = completedAtRaw ? new Date(completedAtRaw) : undefined;
      const optionalFields = ['diagnosis', 'service', 'technicalResponsible', 'completedAt', 'observations'] as const;
      if (optionalFields.some((name) => name in (req.body ?? {}) && typeof req.body[name] !== 'string') || Number.isNaN(updatedAt.getTime()) || !isMaintenanceStatus(status) || (completedAt && Number.isNaN(completedAt.getTime()))) throw new AuthError(400, 'INVALID_MAINTENANCE', 'Dados de manutenção inválidos.');
      const result = await runInTransaction(async (session) => {
        const before = await MaintenanceModel.findById(req.params.maintenanceId).lean().session(session);
        if (!before) throw new AuthError(404, 'NOT_FOUND', 'Manutenção não encontrada.');
        if (new Date(before.updatedAt).getTime() !== updatedAt.getTime()) throw new AuthError(409, 'MAINTENANCE_CONFLICT', 'Manutenção alterada por outra operação. Recarregue os dados e tente novamente.');
        const changedFields = [
          'status',
          ...(field(req, 'diagnosis') ? ['diagnosis'] : []),
          ...(field(req, 'service') ? ['service'] : []),
          ...(field(req, 'technicalResponsible') ? ['technicalResponsible'] : []),
          ...(field(req, 'observations') ? ['observations'] : []),
          ...(completedAt ? ['completedAt'] : []),
        ];
        const auditBefore = Object.fromEntries(changedFields.map((name) => [name, (before as Record<string, unknown>)[name] ?? null]));
        const updated = await updateMaintenanceRecord({ maintenanceId: req.params.maintenanceId, updatedAt, status, ...(field(req, 'diagnosis') ? { diagnosis: field(req, 'diagnosis') } : {}), ...(field(req, 'service') ? { service: field(req, 'service') } : {}), ...(field(req, 'technicalResponsible') ? { technicalResponsible: field(req, 'technicalResponsible') } : {}), ...(field(req, 'observations') ? { observations: field(req, 'observations') } : {}), ...(completedAt ? { completedAt } : {}) }, session);
        if (!updated) throw new AuthError(409, 'MAINTENANCE_CONFLICT', 'Manutenção alterada por outra operação. Recarregue os dados e tente novamente.');
        const auditAfter = {
          status: updated.status,
          ...(field(req, 'diagnosis') ? { diagnosis: field(req, 'diagnosis') } : {}),
          ...(field(req, 'service') ? { service: field(req, 'service') } : {}),
          ...(field(req, 'technicalResponsible') ? { technicalResponsible: field(req, 'technicalResponsible') } : {}),
          ...(field(req, 'observations') ? { observations: field(req, 'observations') } : {}),
          ...(completedAt ? { completedAt: typeof updated.completedAt === 'string' ? updated.completedAt : (updated.completedAt as unknown as Date).toISOString() } : {}),
        };
        await recordAuditEvent({ action: 'maintenance.update', module: 'maintenance', userId: context.userId, actor: actorFromContext(context), entity: { type: 'maintenance', id: updated.id, label: before.equipment.patrimony }, unit: before.unit, result: 'success', before: auditBefore, after: auditAfter, session });
        return updated;
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  return router;
}
