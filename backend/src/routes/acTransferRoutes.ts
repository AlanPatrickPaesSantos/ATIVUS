import express, { type RequestHandler, type Router } from 'express';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import { runInTransaction } from '../database/transaction.js';
import { classifyAcTransferReplay, fingerprintAcTransferRequest, validateAcTransferRequest, AcTransferValidationError, type ValidatedAcTransferRequest } from '../models/AcTransfer.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { AcTransferDomainError, createAcTransferAndMoveMaterials, findAcTransferByIdempotencyKey, listAcTransfers, readAcTransfer } from '../repositories/acTransfersRepository.js';

const REQUEST_FIELDS = new Set(['destinationUnit', 'distributedAt', 'deliverer', 'receiver', 'bg', 'equipmentIds']);
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;

function requireSession(context: SessionContext | undefined): SessionContext {
  if (!context) throw new AuthError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  return context;
}

function requireReader(context: SessionContext | undefined): SessionContext {
  const session = requireSession(context);
  if (session.role !== 'ac_operator' && session.role !== 'ditel_admin') {
    throw new AuthError(403, 'FORBIDDEN', 'Perfil sem acesso às transferências AC.');
  }
  return session;
}

function requireOperator(context: SessionContext | undefined): SessionContext {
  const session = requireSession(context);
  if (session.role !== 'ac_operator') {
    throw new AuthError(403, 'FORBIDDEN', 'Somente operadores AC podem confirmar distribuições.');
  }
  return session;
}

function parseIdempotencyKey(req: express.Request): string {
  const key = req.get('Idempotency-Key')?.trim() ?? '';
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new AuthError(400, 'INVALID_IDEMPOTENCY_KEY', 'Chave de idempotência inválida.');
  }
  return key;
}

function parseRequest(body: unknown): ValidatedAcTransferRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AuthError(400, 'INVALID_AC_TRANSFER', 'Dados da distribuição inválidos.');
  }
  if (Object.keys(body).some((field) => !REQUEST_FIELDS.has(field))) {
    throw new AuthError(400, 'INVALID_AC_TRANSFER', 'Dados da distribuição inválidos.');
  }
  try {
    return validateAcTransferRequest(body);
  } catch (error) {
    if (error instanceof AcTransferValidationError) {
      throw new AuthError(400, 'INVALID_AC_TRANSFER', error.message);
    }
    throw error;
  }
}

function parseQuery(req: express.Request) {
  const positiveInteger = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
    return parsed;
  };
  const page = positiveInteger(req.query.page, 1);
  const pageSize = positiveInteger(req.query.pageSize, 20);
  if (pageSize > 100) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
  return { page, pageSize };
}

function actorFromContext(context: SessionContext) {
  return { id: context.userId, name: context.name, registration: context.registration, role: context.role };
}

function mapDomainError(error: unknown): AuthError | null {
  if (!(error instanceof AcTransferDomainError)) return null;
  if (error.code === 'AC_DESTINATION_UNAVAILABLE') return new AuthError(400, error.code, error.message);
  return new AuthError(409, error.code, error.message);
}

async function findReplayAfterConcurrentFailure(req: express.Request) {
  const idempotencyKey = parseIdempotencyKey(req);
  const input = parseRequest(req.body);
  const fingerprint = fingerprintAcTransferRequest(input);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await findAcTransferByIdempotencyKey(idempotencyKey);
    if (existing) return { existing, fingerprint };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { existing: null, fingerprint };
}

export function createAcTransferRoutes(requireSessionMiddleware: RequestHandler): Router {
  const router = express.Router();

  router.post('/ac/transfers', requireSessionMiddleware, async (req, res, next) => {
    try {
      const context = requireOperator(req.sessionContext);
      const idempotencyKey = parseIdempotencyKey(req);
      const input = parseRequest(req.body);
      const fingerprint = fingerprintAcTransferRequest(input);
      const existing = await findAcTransferByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (classifyAcTransferReplay(existing.fingerprint, fingerprint) === 'conflict') {
          throw new AuthError(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada com outro payload.');
        }
        res.status(200).json(existing.transfer);
        return;
      }

      const result = await runInTransaction(async (session) => {
        const transfer = await createAcTransferAndMoveMaterials(input, idempotencyKey, fingerprint, context.userId, session);
        await recordAuditEvent({
          action: 'ac.transfer.confirm',
          module: 'ac',
          userId: context.userId,
          actor: actorFromContext(context),
          entity: { type: 'ac_transfer', id: transfer.id },
          unit: transfer.destinationUnit,
          result: 'success',
          before: null,
          after: { origin: transfer.origin, destinationUnit: transfer.destinationUnit, materials: transfer.materials.map((material: any) => ({ equipmentId: material.equipmentId, patrimony: material.patrimony })) },
          session,
        });
        return transfer;
      });
      res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof AcTransferDomainError && error.code !== 'AC_DESTINATION_UNAVAILABLE') {
        try {
          const replay = await findReplayAfterConcurrentFailure(req);
          if (replay.existing && classifyAcTransferReplay(replay.existing.fingerprint, replay.fingerprint) === 'replay') {
            res.status(200).json(replay.existing.transfer);
            return;
          }
        } catch (replayError) {
          next(replayError);
          return;
        }
      }
      const domainError = mapDomainError(error);
      if (domainError) {
        next(domainError);
        return;
      }
      if (error?.code === 11000) {
        try {
          const idempotencyKey = parseIdempotencyKey(req);
          const input = parseRequest(req.body);
          const fingerprint = fingerprintAcTransferRequest(input);
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const existing = await findAcTransferByIdempotencyKey(idempotencyKey);
            if (existing) {
              if (classifyAcTransferReplay(existing.fingerprint, fingerprint) === 'replay') {
                res.status(200).json(existing.transfer);
                return;
              }
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          next(new AuthError(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada com outro payload.'));
        } catch (replayError) {
          next(replayError);
        }
        return;
      }
      next(error);
    }
  });

  router.get('/ac/transfers', requireSessionMiddleware, async (req, res, next) => {
    try {
      requireReader(req.sessionContext);
      const { page, pageSize } = parseQuery(req);
      res.json(await listAcTransfers(page, pageSize));
    } catch (error) {
      next(error);
    }
  });

  router.get('/ac/transfers/:transferId', requireSessionMiddleware, async (req, res, next) => {
    try {
      requireReader(req.sessionContext);
      const transfer = await readAcTransfer(req.params.transferId);
      if (!transfer) {
        res.status(404).json({ code: 'NOT_FOUND', message: 'Transferência AC não encontrada.' });
        return;
      }
      res.json(transfer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
