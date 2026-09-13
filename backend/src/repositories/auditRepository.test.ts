import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { recordAuditEvent } from './auditRepository.js';

async function clearDatabase() {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
}

const actor = {
  id: 'admin-1',
  name: 'Admin DITEL',
  registration: '10001',
  role: 'ditel_admin',
};

const unit = {
  id: 'unit-1',
  name: '1ª Companhia',
  acronym: '1CIA',
};

describe('audit repository', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectToDatabase(mongoServer.getUri());
    await AuditEventModel.init();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('records rich audit metadata, sanitizes secrets and deduplicates an idempotency key', async () => {
    const first = await recordAuditEvent({
      action: 'admin.users.situation.update',
      module: 'administration',
      userId: actor.id,
      actor,
      entity: { type: 'user', id: 'target-user-1', label: 'Usuário alvo' },
      unit,
      result: 'success',
      before: {
        situation: 'active',
        passwordHash: 'hash-nao-deve-aparecer',
        nested: { tokenDigest: 'digest-nao-deve-aparecer' },
        note: 'texto com senha operacional',
      },
      after: {
        situation: 'blocked',
        sessionId: 'sessao-nao-deve-aparecer',
        token: 'token-nao-deve-aparecer',
      },
      idempotencyKey: 'admin.users.situation.update:target-user-1:active:blocked',
    } as never);

    const second = await recordAuditEvent({
      action: 'admin.users.situation.update',
      module: 'administration',
      userId: actor.id,
      actor,
      entity: { type: 'user', id: 'target-user-1' },
      unit,
      result: 'success',
      idempotencyKey: 'admin.users.situation.update:target-user-1:active:blocked',
    } as never);

    const storedAuditEvent = await AuditEventModel.findById(first.id).lean().orFail();

    expect(second.id).toBe(first.id);
    expect(await AuditEventModel.countDocuments()).toBe(1);
    expect(storedAuditEvent).toMatchObject({
      action: 'admin.users.situation.update',
      module: 'administration',
      userId: actor.id,
      actor,
      entity: { type: 'user', id: 'target-user-1', label: 'Usuário alvo' },
      unit,
      result: 'success',
      before: { situation: 'active', nested: {} },
      after: { situation: 'blocked' },
    });
    expect(storedAuditEvent.retentionExpiresAt).toEqual(expect.any(Date));
    expect(JSON.stringify(storedAuditEvent)).not.toMatch(/passwordHash|senha|tokenDigest|sessionId|token-nao-deve|digest-nao-deve|sessao-nao-deve/i);
  });

  it('creates filtering, retention and idempotency indexes without a TTL delete policy', async () => {
    const indexes = await AuditEventModel.collection.indexes();

    expect(indexes.some((index) => index.key.createdAt === -1 && index.key._id === -1)).toBe(true);
    expect(indexes.some((index) => index.key.module === 1 && index.key.createdAt === -1)).toBe(true);
    expect(indexes.some((index) => index.key.action === 1 && index.key.createdAt === -1)).toBe(true);
    expect(indexes.some((index) => index.key.userId === 1 && index.key.createdAt === -1)).toBe(true);
    expect(indexes.some((index) => index.key['unit.id'] === 1 && index.key.createdAt === -1)).toBe(true);
    expect(indexes.some((index) => index.key['entity.type'] === 1 && index.key['entity.id'] === 1 && index.key.createdAt === -1)).toBe(true);
    expect(indexes.some((index) => index.key.retentionExpiresAt === 1 && index.expireAfterSeconds === undefined)).toBe(true);
    expect(indexes.some((index) => index.key.idempotencyKey === 1 && index.unique === true)).toBe(true);
    expect(indexes.every((index) => index.expireAfterSeconds === undefined)).toBe(true);
  });
});
