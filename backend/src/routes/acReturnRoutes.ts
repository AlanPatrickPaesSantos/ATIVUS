import express, { type RequestHandler, type Router } from 'express';

import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { AcReturnValidationError, fingerprintAcReturnRequest, validateAcReturnRequest } from '../models/AcReturn.js';
import { AcReturnModel } from '../models/AcReturn.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { AcReturnDomainError, cancelAcReturn, createAcReturnAndLock, decideAcReturn, findAcReturnByIdempotencyKey, listAcReturns, readAcReturn, receiveAcReturn, resolveAcReturnDivergence } from '../repositories/acReturnsRepository.js';
import { PatrimonialConflictError } from '../repositories/patrimonialConflictRepository.js';
import { requireOperationalWritesOpen } from '../middlewares/operationalWriteGate.js';

const REQUEST_FIELDS = new Set(['equipmentId', 'reason']);
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;

function requireSession(context: SessionContext | undefined): SessionContext {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  return context;
}

async function access(context: SessionContext | undefined) {
  const session = requireSession(context);
  const scope = await resolveAccessScopeFromContext(session);
  if (!scope) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
  return { session, scope };
}

function requireAcReader(context: SessionContext | undefined): SessionContext {
  const session = requireSession(context);
  if (session.role !== 'ac_operator' && session.role !== 'ditel_admin') throw new AuthError(403, 'FORBIDDEN', 'Perfil sem acesso às devoluções AC.');
  return session;
}

function requireAcOperator(context: SessionContext | undefined): SessionContext {
  const session = requireSession(context);
  if (session.role !== 'ac_operator') throw new AuthError(403, 'FORBIDDEN', 'Somente operadores AC podem decidir devoluções.');
  return session;
}

function idempotencyKey(req: express.Request) {
  const key = req.get('Idempotency-Key')?.trim() ?? '';
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) throw new AuthError(400, 'INVALID_IDEMPOTENCY_KEY', 'Chave de idempotência inválida.');
  return key;
}

function parseRequest(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((field) => !REQUEST_FIELDS.has(field))) throw new AuthError(400, 'INVALID_AC_RETURN', 'Dados da devolução inválidos.');
  try { return validateAcReturnRequest(body); } catch (error) { if (error instanceof AcReturnValidationError) throw new AuthError(400, 'INVALID_AC_RETURN', error.message); throw error; }
}

function parsePage(req: express.Request) {
  const parse = (value: unknown, fallback: number) => { if (value === undefined) return fallback; if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.'); const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.'); return parsed; };
  const page = parse(req.query.page, 1); const pageSize = parse(req.query.pageSize, 20); if (pageSize > 100) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.'); return { page, pageSize };
}

function actor(context: SessionContext) { return { id: context.userId, name: context.name, registration: context.registration, role: context.role }; }

function mapDomainError(error: unknown): AuthError | null {
  if (error instanceof PatrimonialConflictError) return new AuthError(409, 'AC_RETURN_CONFLICT', error.message);
  if (!(error instanceof AcReturnDomainError)) return null;
  if (error.code === 'AC_RETURN_EQUIPMENT_UNAVAILABLE') return new AuthError(404, error.code, error.message);
  return new AuthError(409, error.code, error.message);
}

async function findReplay(key: string, fingerprint: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await findAcReturnByIdempotencyKey(key);
    if (existing) return existing.fingerprint === fingerprint ? existing : null;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

export function createAcReturnRoutes(requireSessionMiddleware: RequestHandler): Router {
  const router = express.Router();
  router.use((req, res, next) => req.method === 'GET' ? next() : requireOperationalWritesOpen(req, res, next));

  router.post('/ac/returns', requireSessionMiddleware, async (req, res, next) => {
    try {
      const { session, scope } = await access(req.sessionContext);
      if (scope.role !== 'unit_user') throw new AuthError(403, 'FORBIDDEN', 'Somente usuários de unidade podem solicitar devoluções.');
      const key = idempotencyKey(req); const input = parseRequest(req.body); const fingerprint = fingerprintAcReturnRequest(input);
      const existing = await findAcReturnByIdempotencyKey(key);
      if (existing) { if (existing.fingerprint !== fingerprint) throw new AuthError(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada com outro payload.'); res.status(200).json(existing.returnRequest); return; }
      const result = await runInTransaction(async (transaction) => {
        const created = await createAcReturnAndLock(input, scope.unit, session.userId, key, fingerprint, transaction);
        await recordAuditEvent({ action: 'ac.return.request', module: 'ac', userId: session.userId, actor: actor(session), entity: { type: 'ac_return', id: created.id, label: created.equipment.patrimony }, unit: created.origin, result: 'success', before: { equipmentId: created.equipmentId, custody: created.equipment.custody }, after: { status: created.status }, idempotencyKey: key, session: transaction });
        return created;
      });
      res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof PatrimonialConflictError) {
        const key = idempotencyKey(req); const input = parseRequest(req.body); const replay = await findReplay(key, fingerprintAcReturnRequest(input));
        if (replay) { res.status(200).json(replay.returnRequest); return; }
      }
      const mapped = mapDomainError(error); if (mapped) { next(mapped); return; }
      if (error?.code === 11000) { const key = idempotencyKey(req); const existing = await findAcReturnByIdempotencyKey(key); if (existing) { res.status(200).json(existing.returnRequest); return; } next(new AuthError(409, 'CONFLICT', 'O equipamento já possui uma movimentação patrimonial pendente.')); return; }
      next(error);
    }
  });

  router.get('/ac/returns', requireSessionMiddleware, async (req, res, next) => {
    try {
      const session = requireSession(req.sessionContext); const scope = session.role === 'unit_user' ? await resolveAccessScopeFromContext(session) : session.role === 'ac_operator' || session.role === 'ditel_admin' ? { role: session.role, unitId: null } : null;
      if (!scope) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
      const { page, pageSize } = parsePage(req); res.json(await listAcReturns(scope, page, pageSize));
    } catch (error) { next(error); }
  });

  router.get('/ac/returns/:returnId', requireSessionMiddleware, async (req, res, next) => {
    try {
      const session = requireSession(req.sessionContext); const scope = session.role === 'unit_user' ? await resolveAccessScopeFromContext(session) : session.role === 'ac_operator' || session.role === 'ditel_admin' ? { role: session.role, unitId: null } : null;
      if (!scope) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.'); const result = await readAcReturn(req.params.returnId, scope); if (!result) { res.status(404).json({ code: 'NOT_FOUND', message: 'Devolução AC não encontrada.' }); return; } res.json(result);
    } catch (error) { next(error); }
  });

  router.patch('/ac/returns/:returnId/decision', requireSessionMiddleware, async (req, res, next) => {
    try {
      const session = requireAcOperator(req.sessionContext); const status = req.body?.status; const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''; const updatedAt = new Date(req.body?.updatedAt);
      if (!['Aceita', 'Rejeitada'].includes(status) || Number.isNaN(updatedAt.getTime()) || (status === 'Rejeitada' && !reason)) throw new AuthError(400, 'INVALID_AC_RETURN', 'Decisão de devolução inválida.');
      const result = await runInTransaction(async (transaction) => {
        const decided = await decideAcReturn({ id: req.params.returnId, updatedAt, status, ...(reason ? { reason } : {}), decidedBy: session.userId }, transaction);
        if (!decided) throw new AuthError(409, 'AC_RETURN_DECISION_CONFLICT', 'A devolução já foi decidida ou está desatualizada.');
        await recordAuditEvent({ action: status === 'Aceita' ? 'ac.return.accept' : 'ac.return.reject', module: 'ac', userId: session.userId, actor: actor(session), entity: { type: 'ac_return', id: decided.id, label: decided.equipment.patrimony }, unit: decided.origin, result: 'success', before: { status: 'Pendente', custody: decided.equipment.custody }, after: { status: decided.status, reason: decided.decisionReason ?? null }, session: transaction });
        return decided;
      });
      res.json(result);
    } catch (error) { const mapped = mapDomainError(error); next(mapped ?? error); }
  });

  router.patch('/ac/returns/:returnId/cancel', requireSessionMiddleware, async (req, res, next) => {
    try {
      const session = requireSession(req.sessionContext); const scope = session.role === 'unit_user' ? await resolveAccessScopeFromContext(session) : session.role === 'ac_operator' ? { role: 'ac_operator' as const, unitId: null } : null; if (!scope) throw new AuthError(403, 'FORBIDDEN', 'Perfil sem permissão para cancelar devoluções AC.'); const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''; const updatedAt = new Date(req.body?.updatedAt);
      if (!reason || Number.isNaN(updatedAt.getTime())) throw new AuthError(400, 'INVALID_AC_RETURN', 'O cancelamento exige justificativa e data válida.');
      if (scope.role !== 'unit_user' && scope.role !== 'ac_operator') throw new AuthError(403, 'FORBIDDEN', 'Perfil sem permissão para cancelar devoluções AC.');
      const result = await runInTransaction(async (transaction) => { const filter = scope.role === 'unit_user' ? { _id: req.params.returnId, status: 'Pendente', 'origin.id': scope.unitId, requestedBy: session.userId } : { _id: req.params.returnId, status: 'Pendente' }; const current = await AcReturnModel.findOne(filter).session(transaction).lean().exec(); if (!current) { const existing = await AcReturnModel.findById(req.params.returnId).session(transaction).lean().exec(); if (existing && (scope.role === 'ac_operator' || (existing.origin.id === scope.unitId && existing.requestedBy === session.userId))) throw new AuthError(409, 'CONFLICT', 'A devolução já foi decidida, cancelada ou está desatualizada.'); throw new AuthError(404, 'NOT_FOUND', 'Devolução não encontrada no escopo autorizado.'); } const cancelled = await cancelAcReturn({ id: req.params.returnId, updatedAt, reason, cancelledBy: session.userId }, transaction); if (!cancelled) throw new AuthError(409, 'CONFLICT', 'A devolução já foi decidida, cancelada ou está desatualizada.'); await recordAuditEvent({ action: 'ac.return.cancel', module: 'ac', userId: session.userId, result: 'success', session: transaction }); return cancelled; });
      res.json(result);
    } catch (error) { const mapped = mapDomainError(error); next(mapped ?? error); }
  });

  router.patch('/ac/returns/:returnId/receipt', requireSessionMiddleware, async (req, res, next) => {
    try {
      const session = requireAcOperator(req.sessionContext); const status = req.body?.status; const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''; const updatedAt = new Date(req.body?.updatedAt);
      if (!['Recebida', 'Divergência'].includes(status) || Number.isNaN(updatedAt.getTime())) throw new AuthError(400, 'INVALID_AC_RETURN', 'Recebimento de devolução inválido.');
      const result = await runInTransaction(async (transaction) => { const received = await receiveAcReturn({ id: req.params.returnId, updatedAt, status, ...(description ? { description } : {}), receivedBy: session.userId }, transaction); if (!received) throw new AuthError(409, 'AC_RETURN_DECISION_CONFLICT', 'A devolução já foi recebida ou está desatualizada.'); await recordAuditEvent({ action: status === 'Recebida' ? 'ac.return.receipt' : 'ac.return.divergence', module: 'ac', userId: session.userId, result: 'success', session: transaction }); return received; });
      res.json(result);
    } catch (error) { const mapped = mapDomainError(error); next(mapped ?? error); }
  });

  router.patch('/ac/returns/:returnId/divergence', requireSessionMiddleware, async (req, res, next) => {
    try {
      const session = requireAcOperator(req.sessionContext); const action = req.body?.action; const resolution = typeof req.body?.resolution === 'string' ? req.body.resolution.trim() : ''; const updatedAt = new Date(req.body?.updatedAt);
      if (!['retomar', 'rejeitar'].includes(action) || !resolution || Number.isNaN(updatedAt.getTime())) throw new AuthError(400, 'INVALID_AC_RETURN', 'Resolução de divergência inválida.');
      const result = await runInTransaction(async (transaction) => { const resolved = await resolveAcReturnDivergence({ id: req.params.returnId, updatedAt, action, resolution, resolvedBy: session.userId }, transaction); if (!resolved) throw new AuthError(409, 'AC_RETURN_DECISION_CONFLICT', 'A divergência já foi resolvida ou está desatualizada.'); await recordAuditEvent({ action: 'ac.return.divergence.resolve', module: 'ac', userId: session.userId, result: 'success', session: transaction }); return resolved; });
      res.json(result);
    } catch (error) { const mapped = mapDomainError(error); next(mapped ?? error); }
  });

  return router;
}
