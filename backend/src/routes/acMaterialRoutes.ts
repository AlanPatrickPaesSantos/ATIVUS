import express, { type RequestHandler, type Router } from 'express';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { createAcMaterial, readAcMaterial, readAcMaterials, type AcMaterialCreateInput } from '../repositories/acMaterialsRepository.js';
import type { EquipmentSituation } from '../models/Equipment.js';

const EQUIPMENT_SITUATIONS = ['active', 'maintenance', 'inactive', 'lost', 'written_off'] as const satisfies EquipmentSituation[];
const CREATE_FIELDS = new Set(['patrimony', 'type', 'model', 'brand', 'situation', 'location', 'serialNumber', 'category', 'warranty', 'observations']);
const MAX_TEXT_LENGTH = 160;

function requireSession(context: SessionContext | undefined): SessionContext {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  return context;
}

function requireAcReader(context: SessionContext | undefined): SessionContext {
  const session = requireSession(context);
  if (session.role !== 'ac_operator' && session.role !== 'ditel_admin') {
    throw new AuthError(403, 'FORBIDDEN', 'Perfil sem acesso ao estoque patrimonial da AC.');
  }
  return session;
}

function requireAcOperator(context: SessionContext | undefined): SessionContext {
  const session = requireSession(context);
  if (session.role !== 'ac_operator') {
    throw new AuthError(403, 'FORBIDDEN', 'Somente operadores AC podem cadastrar materiais AC.');
  }
  return session;
}

function text(body: Record<string, unknown>, field: string, required = true): string | undefined {
  const value = body[field];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') throw new AuthError(400, 'INVALID_AC_MATERIAL', 'Dados do material AC inválidos.');
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > MAX_TEXT_LENGTH) {
    throw new AuthError(400, 'INVALID_AC_MATERIAL', 'Dados do material AC inválidos.');
  }
  return normalized;
}

function parseCreateInput(body: unknown, context: SessionContext): AcMaterialCreateInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AuthError(400, 'INVALID_AC_MATERIAL', 'Dados do material AC inválidos.');
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((field) => !CREATE_FIELDS.has(field))) {
    throw new AuthError(400, 'INVALID_AC_MATERIAL', 'Dados do material AC inválidos.');
  }
  const situation = text(input, 'situation');
  if (!situation || !EQUIPMENT_SITUATIONS.includes(situation as EquipmentSituation)) {
    throw new AuthError(400, 'INVALID_AC_MATERIAL', 'Situação patrimonial inválida.');
  }
  return {
    patrimony: text(input, 'patrimony')!,
    type: text(input, 'type')!,
    model: text(input, 'model')!,
    brand: text(input, 'brand')!,
    situation: situation as EquipmentSituation,
    location: text(input, 'location')!,
    ...(text(input, 'serialNumber', false) ? { serialNumber: text(input, 'serialNumber', false) } : {}),
    ...(text(input, 'category', false) ? { category: text(input, 'category', false) } : {}),
    ...(text(input, 'warranty', false) ? { warranty: text(input, 'warranty', false) } : {}),
    ...(text(input, 'observations', false) ? { observations: text(input, 'observations', false) } : {}),
    createdBy: context.userId,
  };
}

function parseQuery(req: express.Request) {
  const parsePositiveInteger = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
    return parsed;
  };
  const page = parsePositiveInteger(req.query.page, 1);
  const pageSize = parsePositiveInteger(req.query.pageSize, 20);
  if (pageSize > 100) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
  if (req.query.search !== undefined && (typeof req.query.search !== 'string' || req.query.search.trim().length > MAX_TEXT_LENGTH)) {
    throw new AuthError(400, 'INVALID_QUERY', 'Pesquisa inválida.');
  }
  return { page, pageSize, search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined };
}

function actorFromContext(context: SessionContext) {
  return { id: context.userId, name: context.name, registration: context.registration, role: context.role };
}

export function createAcMaterialRoutes(requireSessionMiddleware: RequestHandler): Router {
  const router = express.Router();

  router.get('/ac/materials', requireSessionMiddleware, async (req, res, next) => {
    try {
      requireAcReader(req.sessionContext);
      const query = parseQuery(req);
      res.json(await readAcMaterials({ search: query.search }, query.page, query.pageSize));
    } catch (error) {
      next(error);
    }
  });

  router.post('/ac/materials', requireSessionMiddleware, async (req, res, next) => {
    try {
      const context = requireAcOperator(req.sessionContext);
      const input = parseCreateInput(req.body, context);
      const result = await runInTransaction(async (session) => {
        const created = await createAcMaterial(input, session);
        await recordAuditEvent({
          action: 'ac.material.create',
          module: 'ac',
          userId: context.userId,
          actor: actorFromContext(context),
          entity: { type: 'equipment', id: created.id, label: created.patrimony },
          unit: null,
          result: 'success',
          before: null,
          after: { patrimony: created.patrimony, custody: created.custody },
          session,
        });
        return created;
      });
      res.status(201).json(result);
    } catch (error: any) {
      if (error?.code === 11000) {
        next(new AuthError(409, 'DUPLICATE_PATRIMONY', 'Patrimônio já cadastrado.'));
        return;
      }
      next(error);
    }
  });

  router.get('/ac/materials/:equipmentId', requireSessionMiddleware, async (req, res, next) => {
    try {
      requireAcReader(req.sessionContext);
      const result = await readAcMaterial(req.params.equipmentId);
      if (!result) {
        res.status(404).json({ code: 'NOT_FOUND', message: 'Material AC não encontrado.' });
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
