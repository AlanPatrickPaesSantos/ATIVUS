import express, { type RequestHandler, type Router } from 'express';
import mongoose from 'mongoose';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import type { EquipmentTypeDocument } from '../models/EquipmentType.js';
import {
  createEquipmentType,
  equipmentTypeNameExists,
  findEquipmentTypeById,
  listEquipmentTypes,
  updateEquipmentType,
  type EquipmentTypeInput,
  type EquipmentTypeListItem,
} from '../repositories/equipmentTypeRepository.js';

function actorFromContext(context: SessionContext | undefined) {
  return context ? {
    id: context.userId,
    name: context.name,
    registration: context.registration,
    role: context.role,
  } : null;
}

function requireDitel(context: SessionContext | undefined): asserts context is SessionContext {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Apenas administradores DITEL podem gerenciar tipos de equipamento.');
}

function field(req: express.Request, name: string) {
  const value = req.body?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

function isClosedPayload(req: express.Request, allowed: readonly string[]): boolean {
  return Boolean(req.body)
    && typeof req.body === 'object'
    && !Array.isArray(req.body)
    && Object.keys(req.body).every((key) => allowed.includes(key));
}

function snapshot(type: EquipmentTypeListItem) {
  return { name: type.name, description: type.description, active: type.active };
}

export function createEquipmentTypeRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();

  router.get('/equipment-types', requireSession, async (req, res, next) => {
    try {
      if (!req.sessionContext) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
      const includeInactive = req.sessionContext.role === 'ditel_admin' && req.query.includeInactive === 'true';
      res.json({ items: await listEquipmentTypes(includeInactive) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/equipment-types', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      requireDitel(context);
      if (!isClosedPayload(req, ['name', 'description', 'active'])
        || !field(req, 'name')
        || field(req, 'name').length > 80) {
        throw new AuthError(400, 'INVALID_EQUIPMENT_TYPE', 'Nome do tipo de equipamento é obrigatório (máx. 80 caracteres).');
      }
      if (req.body.active !== undefined && typeof req.body.active !== 'boolean') {
        throw new AuthError(400, 'INVALID_EQUIPMENT_TYPE', 'Indicador ativo inválido.');
      }
      if (await equipmentTypeNameExists(field(req, 'name'))) {
        throw new AuthError(409, 'EQUIPMENT_TYPE_CONFLICT', 'Já existe um tipo de equipamento com esse nome.');
      }
      const input: EquipmentTypeInput = {
        name: field(req, 'name'),
        ...(field(req, 'description') ? { description: field(req, 'description') } : {}),
        ...(typeof req.body.active === 'boolean' ? { active: req.body.active } : {}),
      };
      const result = await runInTransaction(async (session) => {
        const created = await createEquipmentType(input, session);
        await recordAuditEvent({
          action: 'equipment_type.create',
          module: 'inventory',
          userId: context.userId,
          actor: actorFromContext(context),
          entity: { type: 'equipment_type', id: created.id, label: created.name },
          result: 'success',
          after: snapshot(created),
          session,
        });
        return created;
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/equipment-types/:typeId', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      requireDitel(context);
      if (!mongoose.isValidObjectId(req.params.typeId)) throw new AuthError(404, 'NOT_FOUND', 'Tipo de equipamento não encontrado.');
      if (!isClosedPayload(req, ['name', 'description', 'active'])) throw new AuthError(400, 'INVALID_EQUIPMENT_TYPE', 'Campos inválidos.');
      const name = req.body.name !== undefined ? (typeof req.body.name === 'string' ? req.body.name.trim() : '') : undefined;
      if (name !== undefined && (!name || name.length > 80)) throw new AuthError(400, 'INVALID_EQUIPMENT_TYPE', 'Nome do tipo de equipamento é obrigatório (máx. 80 caracteres).');
      if (req.body.active !== undefined && typeof req.body.active !== 'boolean') throw new AuthError(400, 'INVALID_EQUIPMENT_TYPE', 'Indicador ativo inválido.');
      if (name !== undefined && await equipmentTypeNameExists(name, req.params.typeId)) throw new AuthError(409, 'EQUIPMENT_TYPE_CONFLICT', 'Já existe um tipo de equipamento com esse nome.');

      const result = await runInTransaction(async (session) => {
        const before = await findEquipmentTypeById(req.params.typeId, session);
        if (!before) throw new AuthError(404, 'NOT_FOUND', 'Tipo de equipamento não encontrado.');
        const updated = await updateEquipmentType(req.params.typeId, {
          ...(name !== undefined ? { name } : {}),
          ...(req.body.description !== undefined ? { description: typeof req.body.description === 'string' ? req.body.description.trim() : '' } : {}),
          ...(typeof req.body.active === 'boolean' ? { active: req.body.active } : {}),
        }, session);
        if (!updated) throw new AuthError(404, 'NOT_FOUND', 'Tipo de equipamento não encontrado.');
        await recordAuditEvent({
          action: 'equipment_type.update',
          module: 'inventory',
          userId: context.userId,
          actor: actorFromContext(context),
          entity: { type: 'equipment_type', id: updated.id, label: updated.name },
          result: 'success',
          before: snapshot(toListItem(before)),
          after: snapshot(updated),
          session,
        });
        return updated;
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/equipment-types/:typeId', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      requireDitel(context);
      if (!mongoose.isValidObjectId(req.params.typeId)) throw new AuthError(404, 'NOT_FOUND', 'Tipo de equipamento não encontrado.');
      const result = await runInTransaction(async (session) => {
        const before = await findEquipmentTypeById(req.params.typeId, session);
        if (!before) throw new AuthError(404, 'NOT_FOUND', 'Tipo de equipamento não encontrado.');
        const updated = await updateEquipmentType(req.params.typeId, { active: false }, session);
        if (!updated) throw new AuthError(404, 'NOT_FOUND', 'Tipo de equipamento não encontrado.');
        await recordAuditEvent({
          action: 'equipment_type.deactivate',
          module: 'inventory',
          userId: context.userId,
          actor: actorFromContext(context),
          entity: { type: 'equipment_type', id: updated.id, label: updated.name },
          result: 'success',
          before: snapshot(toListItem(before)),
          after: { ...snapshot(updated), active: false },
          session,
        });
        return updated;
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function toListItem(document: EquipmentTypeDocument & { _id?: unknown }) {
  return {
    id: String(document._id),
    name: document.name,
    description: document.description ?? '',
    active: document.active ?? true,
    createdAt: document.createdAt instanceof Date ? document.createdAt : new Date(document.createdAt),
    updatedAt: document.updatedAt instanceof Date ? document.updatedAt : new Date(document.updatedAt),
  };
}