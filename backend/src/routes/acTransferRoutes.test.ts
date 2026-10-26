import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type SessionContext, type SessionService } from '../auth/sessionService.js';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { AcTransferModel } from '../models/AcTransfer.js';
import { EquipmentModel } from '../models/Equipment.js';
import { UnitModel } from '../models/Unit.js';

const acContext: SessionContext = { userId: 'ac-1', name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null };
const ditelContext: SessionContext = { userId: 'ditel-1', name: 'Admin DITEL', registration: '200001', role: 'ditel_admin', unit: null };
const unitContext: SessionContext = { userId: 'unit-1', name: 'Usuário Unidade', registration: '100001', role: 'unit_user', unit: { id: 'unit-1', name: 'Unidade Origem', acronym: 'UO' } };
const destination = { id: 'unit-dest', name: 'Unidade Destino', acronym: 'UD' };
const inactiveDestination = { id: 'unit-inactive', name: 'Unidade Inativa', acronym: 'UI' };

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

function transferPayload(equipmentIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    destinationUnit: destination,
    distributedAt: '2026-10-26T12:00:00.000Z',
    deliverer: { name: 'Entregador AC', registration: 'E-001' },
    receiver: { name: 'Recebedor Unidade', registration: 'R-001' },
    equipmentIds,
    ...overrides,
  };
}

async function seedUnitEquipment(patrimony: string) {
  return EquipmentModel.create({
    patrimony,
    type: 'Rádio',
    model: 'APX',
    brand: 'Motorola',
    situation: 'active',
    location: 'Almoxarifado AC',
    serialNumber: `SN-${patrimony}`,
    category: 'Comunicação',
    custody: { scope: 'AC', unit: null },
    unit: null,
    history: [{ id: `h-${patrimony}`, description: 'Entrada AC', occurredAt: new Date() }],
  });
}

describe('AC transfer routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([EquipmentModel.init(), AcTransferModel.init(), AuditEventModel.init(), UnitModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await UnitModel.create([
      { ...destination, active: true },
      { ...inactiveDestination, active: false },
    ]);
  });

  it('requires AC operator for writes, allows DITEL read and denies unit users', async () => {
    const unauthenticated = await request(appFor()).get('/api/v1/ac/transfers');
    expect(unauthenticated.status).toBe(401);

    const deniedWrite = await request(appFor(ditelContext))
      .post('/api/v1/ac/transfers')
      .set('Cookie', 'sigat_session=test')
      .set('Idempotency-Key', 'key-denied')
      .send(transferPayload([new mongoose.Types.ObjectId().toString()]));
    expect(deniedWrite.status).toBe(403);

    const deniedRead = await request(appFor(unitContext)).get('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test');
    expect(deniedRead.status).toBe(403);
  });

  it('distributes one or multiple AC materials with immediate custody transfer and history', async () => {
    const first = await seedUnitEquipment('RP-AC-101');
    const second = await seedUnitEquipment('RP-AC-102');

    const response = await request(appFor(acContext))
      .post('/api/v1/ac/transfers')
      .set('Cookie', 'sigat_session=test')
      .set('Idempotency-Key', 'key-multiple')
      .send(transferPayload([first.id, second.id], { bg: { number: 'BG-123' } }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ origin: 'AC', status: 'confirmed', destinationUnit: destination, bg: { number: 'BG-123' } });
    expect(response.body.materials).toHaveLength(2);
    expect(await EquipmentModel.countDocuments({ 'custody.scope': 'AC' })).toBe(0);
    expect(await EquipmentModel.countDocuments({ 'custody.scope': 'UNIT', 'custody.unit.id': destination.id, 'unit.id': destination.id })).toBe(2);
    const updated = await EquipmentModel.findById(first.id).lean().orFail();
    expect(updated.history.at(-1)).toMatchObject({ description: 'Distribuição AC para unidade' });
    expect(await AuditEventModel.countDocuments({ action: 'ac.transfer.confirm', result: 'success' })).toBe(1);
  });

  it('rejects unavailable materials, inactive destinations, invalid input and duplicate equipment ids', async () => {
    const material = await seedUnitEquipment('RP-AC-103');
    const ineligible = await seedUnitEquipment('RP-AC-103-B');
    await EquipmentModel.updateOne({ _id: ineligible.id }, { $set: { situation: 'written_off' } });
    const duplicate = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-duplicate').send(transferPayload([material.id, material.id]));
    expect(duplicate.status).toBe(400);

    const inactive = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-inactive').send(transferPayload([material.id], { destinationUnit: inactiveDestination }));
    expect(inactive.status).toBe(400);

    const notEligible = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-ineligible').send(transferPayload([ineligible.id]));
    expect(notEligible.status).toBe(409);

    await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-first').send(transferPayload([material.id]));
    const unavailable = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-second').send(transferPayload([material.id]));
    expect(unavailable.status).toBe(409);
  });

  it('replays an identical idempotency key and rejects a different payload', async () => {
    const material = await seedUnitEquipment('RP-AC-104');
    const payload = transferPayload([material.id]);
    const first = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-replay').send(payload);
    const replay = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-replay').send(payload);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(await AcTransferModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: 'ac.transfer.confirm', result: 'success' })).toBe(1);

    const conflict = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-replay').send(transferPayload([material.id], { receiver: { name: 'Outro Recebedor' } }));
    expect(conflict.status).toBe(409);
  });

  it('returns one original result for concurrent requests with the same idempotency key', async () => {
    const material = await seedUnitEquipment('RP-AC-104-CONCURRENT');
    const payload = transferPayload([material.id]);
    const [first, second] = await Promise.all([
      request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-concurrent-replay').send(payload),
      request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-concurrent-replay').send(payload),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.id).toBe(second.body.id);
    expect(await AcTransferModel.countDocuments()).toBe(1);
    expect(await EquipmentModel.countDocuments({ _id: material.id, 'custody.scope': 'UNIT' })).toBe(1);
  });

  it('rolls back all items when overlapping concurrent transfers contend for one material', async () => {
    const first = await seedUnitEquipment('RP-AC-105');
    const second = await seedUnitEquipment('RP-AC-106');
    const third = await seedUnitEquipment('RP-AC-107');

    const [left, right] = await Promise.all([
      request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-left').send(transferPayload([first.id, second.id])),
      request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-right').send(transferPayload([second.id, third.id])),
    ]);

    expect([left.status, right.status].sort()).toEqual([201, 409]);
    const winner = left.status === 201 ? [first.id, second.id] : [second.id, third.id];
    const loserOnly = left.status === 201 ? third.id : first.id;
    expect(await EquipmentModel.countDocuments({ _id: { $in: winner }, 'custody.scope': 'UNIT' })).toBe(2);
    expect(await EquipmentModel.countDocuments({ _id: loserOnly, 'custody.scope': 'AC' })).toBe(1);
    expect(await AcTransferModel.countDocuments()).toBe(1);
  });

  it('returns paginated transfer history without exposing idempotency internals', async () => {
    const material = await seedUnitEquipment('RP-AC-108');
    const created = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-history').send(transferPayload([material.id]));
    const list = await request(appFor(ditelContext)).get('/api/v1/ac/transfers?page=1&pageSize=1').set('Cookie', 'sigat_session=test');
    const detail = await request(appFor(ditelContext)).get(`/api/v1/ac/transfers/${created.body.id}`).set('Cookie', 'sigat_session=test');

    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(list.body.items[0]).not.toHaveProperty('idempotencyKey');
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: created.body.id, destinationUnit: destination, materials: [{ patrimony: 'RP-AC-108' }] });
  });

  it('rolls back the equipment and transfer when audit persistence fails', async () => {
    const material = await seedUnitEquipment('RP-AC-109');
    const original = AuditEventModel.create;
    AuditEventModel.create = (() => { throw new Error('audit unavailable'); }) as typeof AuditEventModel.create;

    try {
      const response = await request(appFor(acContext)).post('/api/v1/ac/transfers').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'key-audit-fail').send(transferPayload([material.id]));
      expect(response.status).toBe(503);
    } finally {
      AuditEventModel.create = original;
    }

    expect(await AcTransferModel.countDocuments()).toBe(0);
    expect(await EquipmentModel.countDocuments({ _id: material.id, 'custody.scope': 'AC', unit: null })).toBe(1);
  });
});
