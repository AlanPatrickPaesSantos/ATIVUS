import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type SessionContext, type SessionService } from '../auth/sessionService.js';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AcTransferModel } from '../models/AcTransfer.js';
import { EquipmentModel } from '../models/Equipment.js';
import { UnitModel } from '../models/Unit.js';

const acContext: SessionContext = { userId: 'ac-report', name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null };
const ditelContext: SessionContext = { userId: 'ditel-report', name: 'Admin DITEL', registration: '200001', role: 'ditel_admin', unit: null };
const unitContext: SessionContext = { userId: 'unit-report', name: 'Usuário Unidade', registration: '100001', role: 'unit_user', unit: { id: 'unit-report', name: 'Unidade', acronym: 'UNI' } };

function appFor(context?: SessionContext): express.Express {
  const sessionService: SessionService = {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
  return createApp({ sessionService });
}

describe('AC patrimonial report route', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([EquipmentModel.init(), AcTransferModel.init(), UnitModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('allows AC and DITEL readers and denies unit users', async () => {
    expect((await request(appFor()).get('/api/v1/ac/reports/patrimonial')).status).toBe(401);
    expect((await request(appFor(unitContext)).get('/api/v1/ac/reports/patrimonial').set('Cookie', 'sigat_session=test')).status).toBe(403);
    expect((await request(appFor(acContext)).get('/api/v1/ac/reports/patrimonial').set('Cookie', 'sigat_session=test')).status).toBe(200);
    expect((await request(appFor(ditelContext)).get('/api/v1/ac/reports/patrimonial').set('Cookie', 'sigat_session=test')).status).toBe(200);
  });

  it('validates filters and returns paginated distribution rows', async () => {
    const equipment = await EquipmentModel.create({ patrimony: 'RP-ROUTE-1', type: 'Rádio', model: 'APX', brand: 'Motorola', situation: 'active', location: 'AC', unit: null, custody: { scope: 'AC', unit: null }, history: [] });
    await AcTransferModel.create({ origin: 'AC', status: 'confirmed', destinationUnit: { id: 'unit-route', name: 'Unidade Rota', acronym: 'UR' }, distributedAt: new Date('2026-10-20'), bg: { number: 'BG-ROUTE' }, deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' }, materials: [{ equipmentId: String(equipment.id), patrimony: equipment.patrimony, sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: equipment.updatedAt, equipmentVersion: 0 }], createdBy: 'ac', idempotencyKey: 'route-report', fingerprint: 'route-fingerprint' });

    const response = await request(appFor(acContext)).get('/api/v1/ac/reports/patrimonial?from=2026-10-01&to=2026-10-31&unitId=unit-route&bg=BG-ROUTE&page=1&pageSize=1&sort=distributedAt&order=asc').set('Cookie', 'sigat_session=test');
    expect(response.status).toBe(200);
    expect(response.body.distributions).toMatchObject({ total: 1, page: 1, pageSize: 1, items: [{ quantity: 1, bg: { number: 'BG-ROUTE' } }] });
    expect(response.body).not.toHaveProperty('idempotencyKey');

    const invalid = await request(appFor(acContext)).get('/api/v1/ac/reports/patrimonial?pageSize=101').set('Cookie', 'sigat_session=test');
    expect(invalid.status).toBe(400);
  });

  it('reflects immediate AC baixa after a real distribution', async () => {
    await UnitModel.create({ id: 'unit-immediate', name: 'Unidade Imediata', acronym: 'UI', active: true });
    const equipment = await EquipmentModel.create({ patrimony: 'RP-IMMEDIATE-1', type: 'Rádio', model: 'APX', brand: 'Motorola', situation: 'active', location: 'AC', unit: null, custody: { scope: 'AC', unit: null }, history: [] });
    const distribution = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'immediate-report').send({ destinationUnit: { id: 'unit-immediate', name: 'Unidade Imediata', acronym: 'UI' }, distributedAt: '2026-10-26T12:00:00.000Z', deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' }, equipmentIds: [String(equipment.id)] });
    expect(distribution.status).toBe(201);

    const report = await request(appFor(ditelContext)).get('/api/v1/ac/reports/patrimonial?from=2026-10-26&to=2026-10-26&patrimony=RP-IMMEDIATE-1').set('Cookie', 'sigat_session=test');
    expect(report.status).toBe(200);
    expect(report.body.stock.items).toHaveLength(0);
    expect(report.body.metrics).toMatchObject({ availableStock: 0, distributedGoods: 1, transfers: 1 });
  });
});
