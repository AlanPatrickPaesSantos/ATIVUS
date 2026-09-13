import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';

const admin = { userId: 'admin-1', name: 'Admin', registration: '10001', role: 'ditel_admin' as const, unit: null };
const local = { userId: 'user-1', name: 'Local', registration: '20001', role: 'unit_user' as const, unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' } };
const unit1 = { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' };
const unit2 = { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' };

function sessionServiceFor(context: SessionContext): SessionService {
  return {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
}

function getAudit(context: SessionContext, query = '') {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .get(`/api/v1/audit-events${query}`)
    .set('Cookie', 'sigat_session=test');
}

async function seedAuditEvents() {
  await AuditEventModel.collection.insertMany([
    {
      action: 'admin.users.situation.update',
      module: 'administration',
      userId: 'admin-1',
      actor: admin,
      entity: { type: 'user', id: 'target-2', label: 'Alvo 2' },
      unit: unit1,
      result: 'success',
      reason: null,
      before: { situation: 'active' },
      after: { situation: 'blocked' },
      retentionExpiresAt: new Date('2032-09-02T00:00:00.000Z'),
      createdAt: new Date('2026-09-02T10:00:00.000Z'),
      updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    },
    {
      action: 'admin.users.situation.update',
      module: 'administration',
      userId: 'admin-1',
      actor: admin,
      entity: { type: 'user', id: 'target-1', label: 'Alvo 1' },
      unit: unit1,
      result: 'success',
      reason: null,
      before: { situation: 'blocked' },
      after: { situation: 'active' },
      retentionExpiresAt: new Date('2032-09-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    },
    {
      action: 'calls.create',
      module: 'calls',
      userId: 'user-2',
      actor: { id: 'user-2', name: 'Unidade', registration: '20002', role: 'unit_user' },
      entity: { type: 'call', id: 'call-1' },
      unit: unit2,
      result: 'failure',
      reason: null,
      before: null,
      after: null,
      retentionExpiresAt: new Date('2032-09-03T00:00:00.000Z'),
      createdAt: new Date('2026-09-03T10:00:00.000Z'),
      updatedAt: new Date('2026-09-03T10:00:00.000Z'),
    },
  ]);
}

describe('audit routes', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectToDatabase(mongoServer.getUri());
    await AuditEventModel.init();
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('allows only DITEL administrators to read audit events', async () => {
    await seedAuditEvents();

    const forbidden = await getAudit(local);
    const allowed = await getAudit(admin);

    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ code: 'FORBIDDEN', message: 'Acesso administrativo obrigatório.' });
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
  });

  it('filters and paginates audit events for DITEL users', async () => {
    await seedAuditEvents();

    const response = await getAudit(admin, '?module=administration&action=admin.users.situation.update&userId=admin-1&unitId=unit-1&result=success&from=2026-09-01T00:00:00.000Z&to=2026-09-02T23:59:59.999Z&page=1&pageSize=1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      action: 'admin.users.situation.update',
      module: 'administration',
      userId: 'admin-1',
      actor: admin,
      entity: { type: 'user', id: 'target-2', label: 'Alvo 2' },
      unit: unit1,
      result: 'success',
      before: { situation: 'active' },
      after: { situation: 'blocked' },
      retentionExpiresAt: '2032-09-02T00:00:00.000Z',
    });
  });

  it('sanitizes legacy sensitive audit payloads and keeps history without retention metadata', async () => {
    await AuditEventModel.collection.insertOne({
      action: 'admin.users.create',
      module: 'administration',
      userId: 'admin-1',
      actor: admin,
      entity: { type: 'user', id: 'legacy-user' },
      unit: unit1,
      result: 'success',
      reason: null,
      before: { passwordHash: 'hash-secreto', nested: { tokenDigest: 'digest-secreto' } },
      after: { password: 'senha-secreta', sessionId: 'sessao-secreta' },
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const response = await getAudit(admin, '?action=admin.users.create&page=1&pageSize=20');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].retentionExpiresAt).toBeNull();
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password|senha|tokenDigest|sessionId|hash-secreto|digest-secreto|sessao-secreta/i);
  });
});
