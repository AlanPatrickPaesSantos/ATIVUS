import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type SessionContext, type SessionService } from '../auth/sessionService.js';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { EquipmentModel } from '../models/Equipment.js';

const acContext: SessionContext = { userId: 'ac-1', name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null };
const ditelContext: SessionContext = { userId: 'ditel-1', name: 'Admin DITEL', registration: '200001', role: 'ditel_admin', unit: null };
const unitContext: SessionContext = { userId: 'unit-1', name: 'Usuário Unidade', registration: '100001', role: 'unit_user', unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' } };

function sessionServiceFor(context?: SessionContext): SessionService {
  return {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
}

function appFor(context?: SessionContext): express.Express {
  return createApp({ sessionService: sessionServiceFor(context) });
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    patrimony: 'RP-AC-001',
    type: 'Rádio portátil',
    model: 'APX 2000',
    brand: 'Motorola',
    situation: 'active',
    location: 'Almoxarifado AC',
    category: 'Comunicação',
    observations: 'Recebido pela AC',
    ...overrides,
  };
}

describe('AC material routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([EquipmentModel.init(), AuditEventModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('requires authentication', async () => {
    const response = await request(appFor()).get('/api/v1/ac/materials');
    expect(response.status).toBe(401);
  });

  it.each([unitContext])('denies AC material access to unit users', async (context) => {
    const response = await request(appFor(context)).get('/api/v1/ac/materials').set('Cookie', 'sigat_session=test');
    expect(response.status).toBe(403);
  });

  it('allows AC material creation only to AC operators', async () => {
    const response = await request(appFor(ditelContext))
      .post('/api/v1/ac/materials')
      .set('Cookie', 'sigat_session=test')
      .send(material());
    expect(response.status).toBe(403);
  });

  it('creates a material with AC custody, optional serial number and audit atomically', async () => {
    const response = await request(appFor(acContext))
      .post('/api/v1/ac/materials')
      .set('Cookie', 'sigat_session=test')
      .send(material());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ patrimony: 'RP-AC-001', custody: { scope: 'AC', unit: null }, unit: null });
    expect(response.body).not.toHaveProperty('serialNumber');
    const persisted = await EquipmentModel.findById(response.body.id).lean().orFail();
    expect(persisted).toMatchObject({ patrimony: 'RP-AC-001', unit: null, custody: { scope: 'AC', unit: null } });
    expect(persisted.history).toEqual([expect.objectContaining({ description: 'Entrada patrimonial na AC' })]);
    expect(await AuditEventModel.countDocuments({ action: 'ac.material.create', result: 'success' })).toBe(1);
  });

  it('allows DITEL to list and inspect only AC custody materials', async () => {
    const acMaterial = await EquipmentModel.create(material({ custody: { scope: 'AC', unit: null }, unit: null, serialNumber: 'SN-AC-001' }));
    await EquipmentModel.create({ ...material({ patrimony: 'RP-UNIT-001' }), unit: unitContext.unit, custody: { scope: 'UNIT', unit: unitContext.unit } });

    const list = await request(appFor(ditelContext)).get('/api/v1/ac/materials?page=1&pageSize=10').set('Cookie', 'sigat_session=test');
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: String(acMaterial._id), patrimony: 'RP-AC-001', serialNumber: 'SN-AC-001', custody: { scope: 'AC', unit: null }, unit: null });

    const detail = await request(appFor(ditelContext)).get(`/api/v1/ac/materials/${acMaterial.id}`).set('Cookie', 'sigat_session=test');
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(acMaterial.id);
  });

  it('supports RP, serial and description search with pagination', async () => {
    await EquipmentModel.create([
      material({ patrimony: 'RP-AC-001', serialNumber: 'SN-ALFA', observations: 'Console operacional' , custody: { scope: 'AC', unit: null }, unit: null }),
      material({ patrimony: 'RP-AC-002', serialNumber: 'SN-BETA', type: 'Notebook', custody: { scope: 'AC', unit: null }, unit: null }),
    ]);

    const search = await request(appFor(acContext)).get('/api/v1/ac/materials?search=Console&page=1&pageSize=1').set('Cookie', 'sigat_session=test');
    expect(search.status).toBe(200);
    expect(search.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(search.body.items[0].patrimony).toBe('RP-AC-001');
  });

  it('rejects duplicate RP, unknown fields and invalid input without persistence', async () => {
    await EquipmentModel.create(material({ custody: { scope: 'AC', unit: null }, unit: null }));

    const duplicate = await request(appFor(acContext)).post('/api/v1/ac/materials').set('Cookie', 'sigat_session=test').send(material({ serialNumber: 'SN-NEW' }));
    expect(duplicate.status).toBe(409);

    const massAssignment = await request(appFor(acContext)).post('/api/v1/ac/materials').set('Cookie', 'sigat_session=test').send(material({ patrimony: 'RP-AC-002', unit: unitContext.unit, custody: { scope: 'UNIT', unit: unitContext.unit }, createdBy: 'forged' }));
    expect(massAssignment.status).toBe(400);
    expect(await EquipmentModel.countDocuments({ patrimony: 'RP-AC-002' })).toBe(0);
  });

  it('returns not found for a valid equipment id outside AC custody', async () => {
    const unitEquipment = await EquipmentModel.create({ ...material({ patrimony: 'RP-UNIT-001' }), unit: unitContext.unit, custody: { scope: 'UNIT', unit: unitContext.unit } });
    const response = await request(appFor(ditelContext)).get(`/api/v1/ac/materials/${unitEquipment.id}`).set('Cookie', 'sigat_session=test');
    expect(response.status).toBe(404);
  });
});
