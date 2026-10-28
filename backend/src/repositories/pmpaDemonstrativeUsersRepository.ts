import type { ClientSession } from 'mongoose';

import { AuditPersistenceError, recordAuditEvent } from './auditRepository.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { UserModel, type UnitReference, type UserRole } from '../models/User.js';
import type { DemonstrativeUserPersistenceRecord, DemonstrativeUsersProgressEvent, ExistingDemonstrativeUser, PlannedDemonstrativeUser } from '../operations/pmpaDemonstrativeUsers.js';

export async function listUsersForDemonstrativePlan(): Promise<ExistingDemonstrativeUser[]> {
  const users = await UserModel.find({}, { registration: 1, role: 1, unit: 1, provisioning: 1 }).lean().exec() as unknown as Array<{ registration: string; role: UserRole; unit?: UnitReference | null; provisioning?: { batchId: string } }>;
  return users.map((user) => ({
    registration: String(user.registration),
    role: user.role,
    unitId: user.unit?.id ?? null,
    provisioningBatchId: user.provisioning?.batchId ?? null,
  }));
}

export async function ensureDemonstrativeUsersAuditCollection(): Promise<void> {
  try {
    await AuditEventModel.createCollection();
    await AuditEventModel.createIndexes();
  } catch (error) {
    if (Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 48)) return;
    throw new AuditPersistenceError('collection_unavailable', null, 'audit.collection.prepare');
  }
}

export function demonstrativeUserAuditIdempotencyKey(batchId: string, registration: string): string {
  return `pmpa-demonstrative-users.create:${batchId}:${registration}`;
}

export async function createDemonstrativeUsers(records: DemonstrativeUserPersistenceRecord[], session: ClientSession, options: { onProgress?: (event: DemonstrativeUsersProgressEvent) => void; shouldAbort?: () => boolean } = {}): Promise<void> {
  if (options.shouldAbort?.()) throw new Error('provisioning_interrupted_during_transaction');
  options.onProgress?.({ stage: 'users_insert_started', count: records.length });
  const created = await UserModel.insertMany(records.map((record) => ({
    name: record.name,
    registration: record.registration,
    role: record.role,
    situation: record.situation,
    unit: record.unit,
    mustChangePassword: record.mustChangePassword,
    provisioning: record.provisioning,
    passwordHash: record.passwordHash,
  })), { session, ordered: true }) as unknown as Array<{ _id: unknown; registration: string; role: UserRole; unit: UnitReference; provisioning: { batchId: string; kind: string } }>;
  options.onProgress?.({ stage: 'users_insert_completed', count: created.length });
  if (options.shouldAbort?.()) throw new Error('provisioning_interrupted_during_transaction');

  options.onProgress?.({ stage: 'audit_started', count: created.length });
  for (const [eventIndex, user] of created.entries()) {
    options.onProgress?.({ stage: 'audit_event_started', count: created.length, eventIndex });
    try {
      await recordAuditEvent({
        action: 'pmpa-demonstrative-users.create',
        module: 'administration',
        userId: String(user._id),
        actor: { id: 'pmpa-users-provisioner', name: 'Provisionador PMPA demonstrativo', role: 'ditel_admin' },
        entity: { type: 'user', id: String(user._id), label: user.registration },
        unit: user.unit,
        result: 'success',
        idempotencyKey: demonstrativeUserAuditIdempotencyKey(user.provisioning.batchId, user.registration),
        after: { registration: user.registration, role: user.role, provisioning: user.provisioning },
        session,
      });
    } catch (error) {
      if (error instanceof AuditPersistenceError) {
        throw new AuditPersistenceError(error.diagnosticCode, error.field, error.operation, eventIndex, error.mongoCode, error.errorName, error.causeName, error.indexName);
      }
      throw error;
    }
  }
  options.onProgress?.({ stage: 'audit_completed', count: created.length });
  if (options.shouldAbort?.()) throw new Error('provisioning_interrupted_during_transaction');
}

export async function listUsersForDemonstrativeBatch(batchId: string) {
  return UserModel.find({ 'provisioning.batchId': batchId }).select({ _id: 1, registration: 1, situation: 1, unit: 1, provisioning: 1 }).lean().exec() as unknown as Promise<Array<{ _id: unknown; registration: string; situation: string; unit?: UnitReference | null; provisioning?: { batchId: string; kind: string } }>>;
}

export async function deactivateDemonstrativeUsers(batchId: string, session: ClientSession): Promise<number> {
  const users = await listUsersForDemonstrativeBatch(batchId);
  let changed = 0;
  for (const user of users) {
    if (user.situation === 'inactive') continue;
    await UserModel.updateOne({ _id: user._id, 'provisioning.batchId': batchId }, { $set: { situation: 'inactive' } }, { session, runValidators: true }).exec();
    await recordAuditEvent({
      action: 'pmpa-demonstrative-users.deactivate',
      module: 'administration',
      userId: String(user._id),
      actor: { id: 'pmpa-users-provisioner', name: 'Provisionador PMPA demonstrativo', role: 'ditel_admin' },
      entity: { type: 'user', id: String(user._id), label: user.registration },
      unit: user.unit,
      result: 'success',
      before: { situation: user.situation, provisioning: user.provisioning },
      after: { situation: 'inactive', provisioning: user.provisioning },
      session,
    });
    changed += 1;
  }
  return changed;
}

