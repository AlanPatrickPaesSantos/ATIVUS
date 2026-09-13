import { randomBytes } from 'node:crypto';
import express, { type RequestHandler, type Router } from 'express';
import mongoose from 'mongoose';

import { AuthError, type SessionContext } from '../auth/sessionService.js';
import type { UnitReference, UserRole, UserSituation } from '../models/User.js';
import { isAuditPersistenceError, recordAuditEvent } from '../repositories/auditRepository.js';
import {
  createAdminUser,
  findAdminUserAuditRecord,
  listAdminUsers,
  resetAdminUserPassword,
  transitionAdminUserSituation,
  updateAdminUser,
  type AdminUserAuditRecord,
  type AdminUserCreateInput,
  type AdminUserFilters,
  type AdminUserListItem,
  type AdminUserUpdateInput,
} from '../repositories/usersRepository.js';
import { revokeSessionsForUser } from '../repositories/sessionsRepository.js';
import { findActiveUnitReference } from '../repositories/unitsRepository.js';

const roles = new Set<UserRole>(['ditel_admin', 'unit_user']);
const situations = new Set(['Ativo', 'Bloqueado', 'Inativo']);
const mutableSituations = new Set(['active', 'blocked']);
const SITUATION_AUDIT_ACTION = 'admin.users.situation.update';
const CREATE_AUDIT_ACTION = 'admin.users.create';
const UPDATE_AUDIT_ACTION = 'admin.users.update';
const PASSWORD_RESET_AUDIT_ACTION = 'admin.users.credential_reset';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseQuery(req: Parameters<RequestHandler>[0]) {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const pageSize = req.query.pageSize === undefined ? 20 : Number(req.query.pageSize);

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
  }

  const role = typeof req.query.role === 'string' ? req.query.role : undefined;
  const situation = typeof req.query.situation === 'string' ? req.query.situation : undefined;

  if (role && !roles.has(role as UserRole)) {
    throw new AuthError(400, 'INVALID_QUERY', 'Perfil inválido.');
  }

  if (situation && !situations.has(situation)) {
    throw new AuthError(400, 'INVALID_QUERY', 'Situação inválida.');
  }

  const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
  const search = text(req.query.search);

  return {
    page,
    pageSize,
    filters: {
      search: search ? escapeRegex(search) : undefined,
      role: role as UserRole | undefined,
      unitId: text(req.query.unitId),
      situation: situation as AdminUserFilters['situation'],
    },
  };
}

function actorFromContext(context: SessionContext | undefined) {
  return context ? {
    id: context.userId,
    name: context.name,
    registration: context.registration,
    role: context.role,
  } : null;
}

function auditSituationFailure(context: SessionContext | undefined) {
  return recordAuditEvent({
    action: SITUATION_AUDIT_ACTION,
    module: 'administration',
    userId: context?.userId ?? null,
    actor: actorFromContext(context),
    result: 'failure',
  });
}

function createFailure(context: SessionContext | undefined) {
  return recordAuditEvent({
    action: CREATE_AUDIT_ACTION,
    module: 'administration',
    userId: context?.userId ?? null,
    actor: actorFromContext(context),
    result: 'failure',
  });
}

function updateFailure(context: SessionContext | undefined) {
  return recordAuditEvent({
    action: UPDATE_AUDIT_ACTION,
    module: 'administration',
    userId: context?.userId ?? null,
    actor: actorFromContext(context),
    result: 'failure',
  });
}

function auditPasswordResetFailure(context: SessionContext | undefined) {
  return recordAuditEvent({
    action: PASSWORD_RESET_AUDIT_ACTION,
    module: 'administration',
    userId: context?.userId ?? null,
    actor: actorFromContext(context),
    result: 'failure',
  });
}

function situationAuditIdempotencyKey(
  user: AdminUserAuditRecord,
  currentSituation: UserSituation,
  nextSituation: 'active' | 'blocked',
  actorId: string | null | undefined,
) {
  return `${SITUATION_AUDIT_ACTION}:${user.id}:${currentSituation}:${nextSituation}:${actorId ?? 'anonymous'}`;
}

function requestedSituation(req: Parameters<RequestHandler>[0]): 'active' | 'blocked' {
  const situation = req.body?.situation;
  if (typeof situation !== 'string' || !mutableSituations.has(situation)) {
    throw new AuthError(400, 'INVALID_SITUATION', 'Situação de destino inválida.');
  }
  return situation as 'active' | 'blocked';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function requestedUser(req: Parameters<RequestHandler>[0]): Promise<AdminUserCreateInput> {
  if (!isRecord(req.body)) {
    throw new AuthError(400, 'INVALID_USER', 'Dados do usuário inválidos.');
  }

  const allowed = new Set(['name', 'registration', 'role', 'password', 'unit']);
  if (Object.keys(req.body).some((key) => !allowed.has(key))) {
    throw new AuthError(400, 'INVALID_USER', 'Dados do usuário inválidos.');
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const registration = typeof req.body.registration === 'string' ? req.body.registration.trim() : '';
  const role = req.body.role;
  const password = req.body.password;

  if (
    !name
    || !registration
    || (role !== 'ditel_admin' && role !== 'unit_user')
    || typeof password !== 'string'
    || password.length === 0
  ) {
    throw new AuthError(400, 'INVALID_USER', 'Dados do usuário inválidos.');
  }

  if (role === 'ditel_admin') {
    if (req.body.unit !== undefined && req.body.unit !== null) {
      throw new AuthError(400, 'INVALID_USER', 'Administrador DITEL não pode ser limitado a uma unidade.');
    }
    return { name, registration, role, password, unit: null };
  }

  if (
    !isRecord(req.body.unit)
    || typeof req.body.unit.id !== 'string'
    || typeof req.body.unit.name !== 'string'
    || typeof req.body.unit.acronym !== 'string'
  ) {
    throw new AuthError(400, 'INVALID_USER', 'Usuário de unidade deve possuir uma unidade válida.');
  }

  const unitId = req.body.unit.id.trim();
  const unit = await findActiveUnitReference(unitId);

  if (!unit || unit.name !== req.body.unit.name.trim() || unit.acronym !== req.body.unit.acronym.trim()) {
    throw new AuthError(400, 'INVALID_USER', 'Unidade inválida.');
  }

  return { name, registration, role, password, unit };
}

async function requestedUserUpdate(req: Parameters<RequestHandler>[0]): Promise<AdminUserUpdateInput> {
  if (!isRecord(req.body)) {
    throw new AuthError(400, 'INVALID_USER', 'Dados do usuário inválidos.');
  }

  const allowed = new Set(['name', 'registration', 'role', 'unit', 'updatedAt']);
  if (Object.keys(req.body).some((key) => !allowed.has(key))) {
    throw new AuthError(400, 'INVALID_USER', 'Dados do usuário inválidos.');
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const registration = typeof req.body.registration === 'string' ? req.body.registration.trim() : '';
  const role = req.body.role;
  const updatedAt = typeof req.body.updatedAt === 'string' ? new Date(req.body.updatedAt) : null;

  if (!name || !registration || (role !== 'ditel_admin' && role !== 'unit_user') || !updatedAt || Number.isNaN(updatedAt.getTime())) {
    throw new AuthError(400, 'INVALID_USER', 'Dados do usuário inválidos.');
  }

  if (role === 'ditel_admin') {
    if (req.body.unit !== null) {
      throw new AuthError(400, 'INVALID_USER', 'Administrador DITEL não pode ser limitado a uma unidade.');
    }
    return { name, registration, role, unit: null, updatedAt };
  }

  if (
    !isRecord(req.body.unit)
    || typeof req.body.unit.id !== 'string'
    || typeof req.body.unit.name !== 'string'
    || typeof req.body.unit.acronym !== 'string'
  ) {
    throw new AuthError(400, 'INVALID_USER', 'Usuário de unidade deve possuir uma unidade válida.');
  }

  const unitId = req.body.unit.id.trim();
  const unit = await findActiveUnitReference(unitId);

  if (!unit || unit.name !== req.body.unit.name.trim() || unit.acronym !== req.body.unit.acronym.trim()) {
    throw new AuthError(400, 'INVALID_USER', 'Unidade inválida.');
  }

  return { name, registration, role, unit, updatedAt };
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

function userAuditSnapshot(user: AdminUserListItem) {
  return {
    name: user.name,
    registration: user.registration,
    role: user.role,
    situation: user.situation,
    unit: user.unit,
  };
}

function generateTemporaryPassword(): string {
  return randomBytes(24).toString('base64url');
}

async function createAdminUserWithAudit(input: AdminUserCreateInput, context: SessionContext): Promise<AdminUserListItem> {
  const session = await mongoose.startSession();
  let createdUser: AdminUserListItem | null = null;

  try {
    await session.withTransaction(async () => {
      createdUser = await createAdminUser(input, session);

      await recordAuditEvent({
        action: CREATE_AUDIT_ACTION,
        module: 'administration',
        userId: context.userId,
        actor: actorFromContext(context),
        entity: { type: 'user', id: createdUser.id, label: createdUser.name },
        unit: createdUser.unit,
        result: 'success',
        before: null,
        after: userAuditSnapshot(createdUser),
        idempotencyKey: `${CREATE_AUDIT_ACTION}:${createdUser.registration}`,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!createdUser) {
    throw new AuthError(500, 'USER_CREATE_FAILED', 'Não foi possível criar usuário.');
  }

  return createdUser;
}

async function updateAdminUserWithAudit(
  userId: string,
  input: AdminUserUpdateInput,
  context: SessionContext,
): Promise<AdminUserListItem> {
  const session = await mongoose.startSession();
  let updatedUser: AdminUserListItem | null = null;

  try {
    await session.withTransaction(async () => {
      const currentUser = await findAdminUserAuditRecord(userId, session);

      if (!currentUser) {
        throw new AuthError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
      }

      if (currentUser.updatedAt.getTime() !== input.updatedAt.getTime()) {
        throw new AuthError(409, 'USER_CONFLICT', 'Usuário alterado por outra operação. Recarregue os dados e tente novamente.');
      }

      updatedUser = await updateAdminUser(currentUser.id, input, session);

      if (!updatedUser) {
        throw new AuthError(409, 'USER_CONFLICT', 'Usuário alterado por outra operação. Recarregue os dados e tente novamente.');
      }

      await recordAuditEvent({
        action: UPDATE_AUDIT_ACTION,
        module: 'administration',
        userId: context.userId,
        actor: actorFromContext(context),
        entity: { type: 'user', id: updatedUser.id, label: updatedUser.name },
        unit: updatedUser.unit,
        result: 'success',
        before: userAuditSnapshot(currentUser),
        after: userAuditSnapshot(updatedUser),
        idempotencyKey: `${UPDATE_AUDIT_ACTION}:${updatedUser.id}:${updatedUser.updatedAt.toISOString()}:${context.userId}`,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!updatedUser) {
    throw new AuthError(500, 'USER_UPDATE_FAILED', 'Não foi possível atualizar usuário.');
  }

  return updatedUser;
}

async function updateSituationWithAudit(
  user: AdminUserAuditRecord,
  nextSituation: 'active' | 'blocked',
  context: SessionContext,
): Promise<boolean> {
  const session = await mongoose.startSession();
  let changed = false;

  try {
    await session.withTransaction(async () => {
      changed = await transitionAdminUserSituation(user.id, user.situation, nextSituation, session);

      if (!changed) {
        return;
      }

      await recordAuditEvent({
        action: SITUATION_AUDIT_ACTION,
        module: 'administration',
        userId: context.userId,
        actor: actorFromContext(context),
        entity: { type: 'user', id: user.id, label: user.name },
        unit: user.unit,
        result: 'success',
        before: { situation: user.situation },
        after: { situation: nextSituation },
        idempotencyKey: situationAuditIdempotencyKey(user, user.situation, nextSituation, context.userId),
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  return changed;
}

async function resetPasswordWithAudit(
  user: AdminUserAuditRecord,
  temporaryPassword: string,
  context: SessionContext,
): Promise<{ sessionsRevoked: number }> {
  const session = await mongoose.startSession();
  let sessionsRevoked: number | null = null;

  try {
    await session.withTransaction(async () => {
      const reset = await resetAdminUserPassword(user.id, temporaryPassword, session);

      if (!reset) {
        return;
      }

      sessionsRevoked = await revokeSessionsForUser(user.id, new Date(), session);

      await recordAuditEvent({
        action: PASSWORD_RESET_AUDIT_ACTION,
        module: 'administration',
        userId: context.userId,
        actor: actorFromContext(context),
        entity: { type: 'user', id: user.id, label: user.name },
        unit: user.unit,
        result: 'success',
        before: { requiresCredentialChange: reset.previousMustChangePassword },
        after: { requiresCredentialChange: true, sessionsRevoked },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (sessionsRevoked === null) {
    throw new AuthError(409, 'INVALID_PASSWORD_RESET_TARGET', 'Reset de senha permitido somente para usuário ativo.');
  }

  return { sessionsRevoked };
}

export function createAdminUserRoutes(requireSession: RequestHandler): Router {
  const router = express.Router();

  router.get('/admin/users', requireSession, async (req, res, next) => {
    try {
      if (req.sessionContext?.role !== 'ditel_admin') {
        await recordAuditEvent({
          action: 'admin.users.list',
          module: 'administration',
          userId: req.sessionContext?.userId ?? null,
          actor: actorFromContext(req.sessionContext),
          result: 'failure',
        });
        throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
      }

      const parsed = parseQuery(req);
      const result = await listAdminUsers(parsed.filters, parsed.page, parsed.pageSize);

      await recordAuditEvent({
        action: 'admin.users.list',
        module: 'administration',
        userId: req.sessionContext.userId,
        actor: actorFromContext(req.sessionContext),
        result: 'success',
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/users', requireSession, async (req, res, next) => {
    const context = req.sessionContext;

    try {
      if (context?.role !== 'ditel_admin') {
        await createFailure(context);
        throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
      }

      let input: AdminUserCreateInput;
      try {
        input = await requestedUser(req);
      } catch (error) {
        await createFailure(context);
        throw error;
      }

      try {
        const user = await createAdminUserWithAudit(input, context);
        res.status(201).json(user);
      } catch (error) {
        if (isAuditPersistenceError(error)) {
          throw error;
        }

        await createFailure(context);

        if (isDuplicateKeyError(error)) {
          throw new AuthError(409, 'REGISTRATION_CONFLICT', 'Matrícula já cadastrada.');
        }

        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.patch('/admin/users/:userId', requireSession, async (req, res, next) => {
    const context = req.sessionContext;

    try {
      if (context?.role !== 'ditel_admin') {
        await updateFailure(context);
        throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
      }

      if (!mongoose.isValidObjectId(req.params.userId)) {
        await updateFailure(context);
        throw new AuthError(400, 'INVALID_USER_ID', 'Usuário inválido.');
      }

      let input: AdminUserUpdateInput;
      try {
        input = await requestedUserUpdate(req);
      } catch (error) {
        await updateFailure(context);
        throw error;
      }

      try {
        const user = await updateAdminUserWithAudit(req.params.userId, input, context);
        res.json(user);
      } catch (error) {
        if (isAuditPersistenceError(error)) {
          throw error;
        }

        await updateFailure(context);

        if (isDuplicateKeyError(error)) {
          throw new AuthError(409, 'REGISTRATION_CONFLICT', 'Matrícula já cadastrada.');
        }

        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/admin/users/:userId/password-reset', requireSession, async (req, res, next) => {
    const context = req.sessionContext;

    try {
      if (context?.role !== 'ditel_admin') {
        await auditPasswordResetFailure(context);
        throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
      }

      if (!mongoose.isValidObjectId(req.params.userId)) {
        await auditPasswordResetFailure(context);
        throw new AuthError(400, 'INVALID_USER_ID', 'Usuário inválido.');
      }

      const currentUser = await findAdminUserAuditRecord(req.params.userId);

      if (!currentUser) {
        await auditPasswordResetFailure(context);
        throw new AuthError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
      }

      if (currentUser.situation !== 'active') {
        await auditPasswordResetFailure(context);
        throw new AuthError(409, 'INVALID_PASSWORD_RESET_TARGET', 'Reset de senha permitido somente para usuário ativo.');
      }

      const temporaryPassword = generateTemporaryPassword();

      await resetPasswordWithAudit(currentUser, temporaryPassword, context);

      res.json({
        userId: currentUser.id,
        temporaryPassword,
        mustChangePassword: true,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/admin/users/:userId/situation', requireSession, async (req, res, next) => {
    const context = req.sessionContext;

    try {
      if (context?.role !== 'ditel_admin') {
        await auditSituationFailure(context);
        throw new AuthError(403, 'FORBIDDEN', 'Acesso administrativo obrigatório.');
      }

      if (!mongoose.isValidObjectId(req.params.userId)) {
        await auditSituationFailure(context);
        throw new AuthError(400, 'INVALID_USER_ID', 'Usuário inválido.');
      }

      let nextSituation: 'active' | 'blocked';
      try {
        nextSituation = requestedSituation(req);
      } catch (error) {
        await auditSituationFailure(context);
        throw error;
      }

      const currentUser = await findAdminUserAuditRecord(req.params.userId);

      if (!currentUser) {
        await auditSituationFailure(context);
        throw new AuthError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
      }

      if (currentUser.situation === nextSituation || currentUser.situation === 'inactive') {
        await auditSituationFailure(context);
        throw new AuthError(409, 'INVALID_SITUATION_TRANSITION', 'Transição de situação inválida.');
      }

      const changed = await updateSituationWithAudit(currentUser, nextSituation, context);

      if (!changed) {
        await auditSituationFailure(context);
        throw new AuthError(409, 'INVALID_SITUATION_TRANSITION', 'Transição de situação inválida.');
      }

      res.json({ id: req.params.userId, situation: nextSituation });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
