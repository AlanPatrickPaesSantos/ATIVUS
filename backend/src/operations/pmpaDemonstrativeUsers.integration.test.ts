import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { UserModel } from '../models/User.js';
import { AuditPersistenceError, recordAuditEvent } from '../repositories/auditRepository.js';
import { createDemonstrativeUsers } from '../repositories/pmpaDemonstrativeUsersRepository.js';
import type { DemonstrativeUserPersistenceRecord } from './pmpaDemonstrativeUsers.js';

const batchId = 'demo-users-integration-test';
const testHash = bcrypt.hashSync('integration-only-test-secret', 4);
const EXTERNAL_INTEGRATION_URI = 'mongodb://127.0.0.1:27019/ativus_f6_integration?directConnection=true&replicaSet=rs0';

function records(count = 81): DemonstrativeUserPersistenceRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    registration: `demo.integration.${String(index + 1).padStart(2, '0')}`,
    name: `Usuário de integração ${index + 1}`,
    role: 'unit_user',
    unit: { id: `pmpa:integration:${index + 1}`, name: `Unidade de integração ${index + 1}`, acronym: `I${index + 1}` },
    situation: 'active',
    mustChangePassword: true,
    provisioning: { batchId, kind: 'pmpa-demonstrative-user' },
    passwordHash: testHash,
  }));
}

describe('PMPA demonstrative users real transaction', () => {
  let mongo: MongoMemoryReplSet;

  beforeAll(async () => {
    const externalUri = process.env.PMPA_INTEGRATION_URI;
    if (externalUri) {
      if (externalUri !== EXTERNAL_INTEGRATION_URI) throw new Error('unsafe_external_integration_uri');
      await connectToDatabase(externalUri);
    } else {
      mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      await connectToDatabase(mongo.getUri());
    }
    mongoose.set('autoIndex', false);
    await UserModel.createCollection();
    await AuditEventModel.createCollection();
    await UserModel.createIndexes();
    await AuditEventModel.createIndexes();
  }, 120_000);

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await AuditEventModel.deleteMany({});
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    if (mongo) await mongo.stop();
  });

  it('commits all 81 users and all 81 audit events in one transaction', async () => {
    const session = await mongoose.startSession();
    try {
      try {
        await session.withTransaction(async () => createDemonstrativeUsers(records(), session));
      } catch (error) {
        if (error instanceof AuditPersistenceError) {
          throw new Error(`integration_audit_failure:${JSON.stringify({ diagnosticCode: error.diagnosticCode, operation: error.operation, eventIndex: error.eventIndex, field: error.field, mongoCode: error.mongoCode, indexName: error.indexName, errorName: error.errorName, causeName: error.causeName })}`);
        }
        throw error;
      }
    } finally {
      await session.endSession();
    }

    expect(await UserModel.countDocuments({ 'provisioning.batchId': batchId })).toBe(81);
    expect(await AuditEventModel.countDocuments({ action: 'pmpa-demonstrative-users.create' })).toBe(81);
  });

  it('commits one valid audit event inside a transaction', async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await recordAuditEvent({
          action: 'pmpa-demonstrative-users.integration-smoke',
          module: 'administration',
          userId: 'integration-user-1',
          actor: { id: 'pmpa-users-provisioner', name: 'Provisionador de integração', role: 'ditel_admin' },
          entity: { type: 'user', id: 'integration-user-1', label: 'Usuário de integração' },
          unit: { id: 'pmpa:integration:1', name: 'Unidade de integração 1', acronym: 'I1' },
          result: 'success',
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    expect(await AuditEventModel.countDocuments({ action: 'pmpa-demonstrative-users.integration-smoke' })).toBe(1);
  });

  it('commits 81 events even when a legacy unique idempotency index is present', async () => {
    const indexes = await AuditEventModel.collection.indexes();
    const currentIdempotencyIndex = indexes.find((index) => index.key.idempotencyKey === 1);
    if (currentIdempotencyIndex?.name) await AuditEventModel.collection.dropIndex(currentIdempotencyIndex.name);
    await AuditEventModel.collection.createIndex({ idempotencyKey: 1 }, { unique: true, name: 'legacy_idempotencyKey_unique' });

    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => createDemonstrativeUsers(records(), session));
      } finally {
        await session.endSession();
      }

      expect(await UserModel.countDocuments({ 'provisioning.batchId': batchId })).toBe(81);
      expect(await AuditEventModel.countDocuments({ action: 'pmpa-demonstrative-users.create' })).toBe(81);
    } finally {
      await AuditEventModel.collection.dropIndex('legacy_idempotencyKey_unique');
      await AuditEventModel.createIndexes();
    }
  });

  it('rolls back all users when the audit write fails inside the transaction', async () => {
    await AuditEventModel.collection.createIndex({ action: 1 }, { unique: true, name: 'integration_unique_audit_action' });
    await AuditEventModel.create({ action: 'pmpa-demonstrative-users.create', result: 'success', module: 'administration' });

    const session = await mongoose.startSession();
    try {
      await expect(session.withTransaction(async () => createDemonstrativeUsers(records(), session)))
        .rejects.toMatchObject({ diagnosticCode: 'duplicate_key', operation: 'audit.create', eventIndex: 0, mongoCode: 11000 });
    } finally {
      await session.endSession();
    }

    expect(await UserModel.countDocuments({ 'provisioning.batchId': batchId })).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: 'pmpa-demonstrative-users.create' })).toBe(1);
    await AuditEventModel.collection.dropIndex('integration_unique_audit_action');
  });
});
