import express, { type RequestHandler, type Router } from 'express';
import mongoose from 'mongoose';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { createMissionRecord, getMissionById, getMissions, toMissionListItem, updateMissionRecord, type MissionInput } from '../repositories/missionRepository.js';
import type { MissionDocument } from '../models/Mission.js';

const MISSION_STATUSES = ['assigned', 'in_progress', 'completed', 'cancelled'] as const;
const MISSION_TYPES = ['maintenance', 'installation', 'inspection', 'training', 'other'] as const;
const MISSION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

function actorFromContext(context: SessionContext) {
  return { id: context.userId, name: context.name, registration: context.registration, role: context.role };
}

function requireDitel(context: SessionContext | undefined): asserts context is SessionContext {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Apenas administradores DITEL podem gerenciar missões técnicas.');
}

function requireUnit(context: SessionContext | undefined): asserts context is SessionContext {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  if (context.role !== 'unit_user') throw new AuthError(403, 'FORBIDDEN', 'Operação permitida apenas para usuários de unidade.');
}

function field(req: express.Request, name: string) {
  const value = req.body?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

function toListItem(document: MissionDocument & { _id?: unknown }) {
  return toMissionListItem(document as Parameters<typeof toMissionListItem>[0]);
}

export function createMissionRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();

  router.get('/missions', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
      const unitId = typeof req.query.unitId === 'string' ? req.query.unitId : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      if (unitId && context.role === 'unit_user' && unitId !== context.unit?.id) {
        throw new AuthError(403, 'FORBIDDEN', 'Unidade sem acesso a esta missão.');
      }
      const missions = await getMissions({ unitId, status, role: context.role });
      res.json({ items: missions.map((mission) => toListItem({ ...mission, _id: mission._id })) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/missions', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      requireDitel(context);
      const body = req.body as Record<string, unknown>;
      if (!field(req, 'title') || !field(req, 'description')) {
        throw new AuthError(400, 'INVALID_MISSION', 'Título e descrição são obrigatórios.');
      }
      if (typeof body.unit !== 'object' || body.unit === null || typeof (body.unit as { id?: unknown }).id !== 'string' || !(body.unit as { id: string }).id) {
        throw new AuthError(400, 'INVALID_MISSION', 'Unidade atribuída é obrigatória.');
      }
      const unit = body.unit as { id: string; name?: string; acronym?: string };
      if (!unit.name && !unit.id.endsWith('.name')) {
        throw new AuthError(400, 'INVALID_MISSION', 'Nome da unidade atribuída é obrigatório.');
      }
      if (typeof body.type === 'string' && !MISSION_TYPES.includes(body.type as (typeof MISSION_TYPES)[number])) {
        throw new AuthError(400, 'INVALID_MISSION', 'Tipo de missão inválido.');
      }
      if (typeof body.priority === 'string' && !MISSION_PRIORITIES.includes(body.priority as (typeof MISSION_PRIORITIES)[number])) {
        throw new AuthError(400, 'INVALID_MISSION', 'Prioridade inválida.');
      }
      const input: MissionInput = {
        title: field(req, 'title'),
        description: field(req, 'description'),
        type: typeof body.type === 'string' ? body.type : 'maintenance',
        priority: typeof body.priority === 'string' ? body.priority : 'medium',
        unit: { id: unit.id, name: unit.name ?? unit.id, acronym: unit.acronym ?? '' },
        equipment: Array.isArray(body.equipment) ? body.equipment as MissionInput['equipment'] : [],
        assignedBy: actorFromContext(context),
        assignedTo: typeof body.assignedTo === 'object' && body.assignedTo !== null
          ? { id: String((body.assignedTo as { id?: unknown }).id ?? ''), name: String((body.assignedTo as { name?: unknown }).name ?? ''), registration: String((body.assignedTo as { registration?: unknown }).registration ?? '') }
          : { id: unit.id, name: unit.name ?? '', registration: context.registration },
      };
      const result = await runInTransaction(async (session) => {
        const created = await createMissionRecord(input, session);
        const createdLean = await getMissionById(created._id.toString(), session);
        if (!createdLean) throw new AuthError(500, 'MISSION_CREATE_FAILED', 'Não foi possível criar a missão.');
        await recordAuditEvent({
          action: 'mission.create',
          module: 'mission',
          userId: context.userId,
          actor: actorFromContext(context),
          entity: { type: 'mission', id: createdLean._id.toString(), label: createdLean.title },
          result: 'success',
          before: null,
          after: toListItem(createdLean as MissionDocument & { _id: unknown }),
        });
        return createdLean;
      });
      res.status(201).json(toListItem(result as MissionDocument & { _id: unknown }));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/missions/:missionId', requireSession, async (req, res, next) => {
    try {
      const context = req.sessionContext;
      if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
      const missionId = req.params.missionId;
      if (!mongoose.Types.ObjectId.isValid(missionId)) throw new AuthError(404, 'NOT_FOUND', 'Missão não encontrada.');
      const existing = await getMissionById(missionId);
      if (!existing) throw new AuthError(404, 'NOT_FOUND', 'Missão não encontrada.');
      const before = toListItem(existing as MissionDocument & { _id: unknown });
      const body = req.body as Record<string, unknown>;
      const nextStatus = typeof body.status === 'string' ? body.status : undefined;
      if (nextStatus && !MISSION_STATUSES.includes(nextStatus as (typeof MISSION_STATUSES)[number])) {
        throw new AuthError(400, 'INVALID_MISSION', 'Status de missão inválido.');
      }
      if (nextStatus) {
        const allowedTransitions: Record<string, string[]> = {
          assigned: ['in_progress', 'cancelled'],
          in_progress: ['completed', 'cancelled'],
          completed: [],
          cancelled: [],
        };
        if (!allowedTransitions[before.status]?.includes(nextStatus)) {
          throw new AuthError(409, 'MISSION_TRANSITION', `Transição de "${before.status}" para "${nextStatus}" não permitida.`);
        }
        if ((nextStatus === 'in_progress' || nextStatus === 'completed') && context.role !== 'unit_user') {
          throw new AuthError(403, 'FORBIDDEN', 'Somente a unidade pode iniciar ou concluir a missão.');
        }
        if (nextStatus === 'cancelled' && context.role !== 'ditel_admin') {
          throw new AuthError(403, 'FORBIDDEN', 'Somente a DITEL pode cancelar uma missão.');
        }
      }
      if (context.role === 'unit_user' && existing.unit.id !== context.unit?.id) {
        throw new AuthError(403, 'FORBIDDEN', 'Unidade sem acesso a esta missão.');
      }
      const update: Record<string, unknown> = {};
      if (nextStatus) update.status = nextStatus;
      if (nextStatus === 'in_progress') update.startedAt = new Date();
      if (nextStatus === 'completed') update.completedAt = new Date();
      if (typeof body.note === 'string' && body.note.trim()) {
        update.$push = { notes: { author: context.name, text: body.note.trim() } };
      }
      const result = await runInTransaction(async (session) => {
        const updated = await updateMissionRecord(missionId, update, session);
        if (!updated) throw new AuthError(404, 'NOT_FOUND', 'Missão não encontrada.');
        const updatedLean = await getMissionById(missionId, session);
        if (!updatedLean) throw new AuthError(404, 'NOT_FOUND', 'Missão não encontrada.');
        await recordAuditEvent({
          action: 'mission.update',
          module: 'mission',
          userId: context.userId,
          actor: actorFromContext(context),
          entity: { type: 'mission', id: updatedLean._id.toString(), label: updatedLean.title },
          result: 'success',
          before,
          after: toListItem(updatedLean as MissionDocument & { _id: unknown }),
        });
        return updatedLean;
      });
      res.json(toListItem(result as MissionDocument & { _id: unknown }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}