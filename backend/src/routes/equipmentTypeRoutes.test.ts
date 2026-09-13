import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { EquipmentTypeModel } from '../models/EquipmentType.js';
import { type SessionService } from '../auth/sessionService.js';
import type { SessionContext } from '../auth/sessionService.js';

function sessionServiceFor(context: SessionContext): SessionService {
  return {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
}

const unit1 = { id: 'unit-1', name: 'Unidade Centro', acronym: 'UC', active: true };
const unit2 = { id: 'unit-2', name: 'Unidade Norte', acronym: 'UN', active: true };

const ditelContext: SessionContext = { userId: 'ditel-1', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null };
const unitContext: SessionContext = { userId: 'unit-1', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 };

describe('equipment type routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await waitForPrimary();
    await mongoose.connection.collection('units').insertMany([unit1, unit2]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    await mongoose.connection.collection('units').insertMany([unit1, unit2]);
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('lists active equipment types for any authenticated user and includes inactive only for DITEL', async () => {
    await EquipmentTypeModel.create([
      { name: 'Rádio portátil', description: 'Comunicação', active: true },
      { name: 'Notebook', description: 'Informática', active: true },
      { name: 'Veículo', description: 'Transporte', active: false },
    ]);

    const unitResponse = await request(createApp({ sessionService: sessionServiceFor(unitContext) }))
      .get('/api/v1/equipment-types')
      .set('Cookie', 'sigat_session=test');
    expect(unitResponse.status).toBe(200);
    expect(unitResponse.body.items.map((item: { name: string }) => item.name)).toEqual(['Notebook', 'Rádio portátil']);

    const ditelResponse = await request(createApp({ sessionService: sessionServiceFor(ditelContext) }))
      .get('/api/v1/equipment-types?includeInactive=true')
      .set('Cookie', 'sigat_session=test');
    expect(ditelResponse.status).toBe(200);
    expect(ditelResponse.body.items).toHaveLength(3);
  });

  it('allows DITEL to create an equipment type with audit and no secrets', async () => {
    const response = await request(createApp({ sessionService: sessionServiceFor(ditelContext) }))
      .post('/api/v1/equipment-types')
      .set('Cookie', 'sigat_session=test')
      .send({ name: 'Drone', description: 'Operações aéreas', active: true });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Drone', description: 'Operações aéreas', active: true });
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);

    const audit = await AuditEventModel.findOne({ action: 'equipment_type.create', result: 'success' }).lean();
    expect(audit).toMatchObject({ module: 'inventory', userId: 'ditel-1', after: { name: 'Drone', description: 'Operações aéreas', active: true } });
  });

  it('rejects creation from unit users and duplicate names', async () => {
    await EquipmentTypeModel.create([{ name: 'Drone', active: true }]);

    const forbidden = await request(createApp({ sessionService: sessionServiceFor(unitContext) }))
      .post('/api/v1/equipment-types')
      .set('Cookie', 'sigat_session=test')
      .send({ name: 'Rádio' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const duplicate = await request(createApp({ sessionService: sessionServiceFor(ditelContext) }))
      .post('/api/v1/equipment-types')
      .set('Cookie', 'sigat_session=test')
      .send({ name: 'drone' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('EQUIPMENT_TYPE_CONFLICT');
  });

  it('allows DITEL to update and deactivate an equipment type with before/after audit', async () => {
    const created = await EquipmentTypeModel.create([{ name: 'Tablet', active: true }]);
    const id = String(created[0]._id);

    const updateResponse = await request(createApp({ sessionService: sessionServiceFor(ditelContext) }))
      .patch(`/api/v1/equipment-types/${id}`)
      .set('Cookie', 'sigat_session=test')
      .send({ name: 'Tablet tático', description: 'Informática móvel' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({ name: 'Tablet tático', description: 'Informática móvel' });

    const auditUpdate = await AuditEventModel.findOne({ action: 'equipment_type.update', result: 'success' }).lean();
    expect(auditUpdate).toMatchObject({ before: { name: 'Tablet', description: '', active: true }, after: { name: 'Tablet tático', description: 'Informática móvel', active: true } });

    const deactivateResponse = await request(createApp({ sessionService: sessionServiceFor(ditelContext) }))
      .delete(`/api/v1/equipment-types/${id}`)
      .set('Cookie', 'sigat_session=test');
    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.active).toBe(false);

    const auditDeactivate = await AuditEventModel.findOne({ action: 'equipment_type.deactivate', result: 'success' }).lean();
    expect(auditDeactivate).toMatchObject({ before: { name: 'Tablet tático', active: true }, after: { name: 'Tablet tático', active: false } });
  });
});

async function waitForPrimary(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = new Error('primary not ready');
  while (Date.now() < deadline) {
    try {
      const status = await mongoose.connection.db?.admin().command({ isMaster: 1 });
      if (status && status.ismaster) return;
      lastError = new Error('primary not ready');
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}