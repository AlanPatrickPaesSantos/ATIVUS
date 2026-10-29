import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type SessionContext, type SessionService } from '../auth/sessionService.js';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { EquipmentModel } from '../models/Equipment.js';
import { MovementModel } from '../models/Movement.js';
import { UnitModel } from '../models/Unit.js';

const source = { id: 'unit-1', name: 'Unidade Norte', acronym: 'UN' };
const otherUnit = { id: 'unit-2', name: 'Unidade Sul', acronym: 'US' };
const unitContext: SessionContext = { userId: 'unit-1-user', name: 'Usuário Norte', registration: '100001', role: 'unit_user', unit: source };
const otherUnitContext: SessionContext = { userId: 'unit-2-user', name: 'Usuário Sul', registration: '100002', role: 'unit_user', unit: otherUnit };
const acContext: SessionContext = { userId: 'ac-1', name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null };
const ditelContext: SessionContext = { userId: 'ditel-1', name: 'Admin DITEL', registration: '200001', role: 'ditel_admin', unit: null };

function appFor(context?: SessionContext): express.Express {
  const sessionService: SessionService = {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
  return createApp({ sessionService });
}

async function seedEquipment(overrides: Record<string, unknown> = {}) {
  await UnitModel.create([{ ...source, active: true }, { ...otherUnit, active: true }]);
  return EquipmentModel.create({
    patrimony: 'RP-RETURN-001', type: 'Rádio', model: 'X', brand: 'Marca', situation: 'active', location: 'Unidade Norte',
    unit: source, custody: { scope: 'UNIT', unit: source }, history: [{ id: 'initial', description: 'Cadastro inicial', occurredAt: new Date() }], ...overrides,
  });
}

function returnsCollection() {
  return mongoose.connection.collection('acreturns');
}

describe('AC return routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([EquipmentModel.init(), MovementModel.init(), AuditEventModel.init(), UnitModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('creates a pending return without changing unit custody', async () => {
    const equipment = await seedEquipment();
    const response = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-1').send({ equipmentId: equipment.id, reason: 'Recolhimento para conferência.' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'Pendente', equipmentId: equipment.id, origin: source, requestedBy: unitContext.userId, requestReason: 'Recolhimento para conferência.' });
    expect(await returnsCollection().countDocuments()).toBe(1);
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: source, custody: { scope: 'UNIT', unit: source } });
    expect(await AuditEventModel.countDocuments({ action: 'ac.return.request', result: 'success' })).toBe(1);
  });

  it('authorizes a pending return without changing custody and receives it formally through AC', async () => {
    const equipment = await seedEquipment();
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-accept').send({ equipmentId: equipment.id });

    const accepted = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Aceita', updatedAt: created.body.updatedAt });

    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('Aguardando recebimento');
    expect(await EquipmentModel.countDocuments()).toBe(1);
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: source, custody: { scope: 'UNIT', unit: source } });
    const received = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/receipt`).set('Cookie', 'sigat_session=test').send({ status: 'Recebida', updatedAt: accepted.body.updatedAt });
    expect(received.status).toBe(200);
    expect(received.body.status).toBe('Recebida');
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: null, custody: { scope: 'AC', unit: null } });
    expect(await AuditEventModel.countDocuments({ action: 'ac.return.accept', result: 'success' })).toBe(1);
  });

  it('requires a justification when AC rejects a return', async () => {
    const equipment = await seedEquipment();
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-reject').send({ equipmentId: equipment.id });
    const missingReason = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Rejeitada', updatedAt: created.body.updatedAt });
    expect(missingReason.status).toBe(400);

    const rejected = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Rejeitada', updatedAt: created.body.updatedAt, reason: 'Equipamento deve passar por conferência.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'Rejeitada', decisionReason: 'Equipamento deve passar por conferência.' });
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: source, custody: { scope: 'UNIT', unit: source } });
  });

  it('replays the same idempotency key and rejects a different payload', async () => {
    const equipment = await seedEquipment();
    const first = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-replay').send({ equipmentId: equipment.id, reason: 'Primeiro motivo.' });
    const replay = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-replay').send({ equipmentId: equipment.id, reason: 'Primeiro motivo.' });
    const conflict = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-replay').send({ equipmentId: equipment.id, reason: 'Outro motivo.' });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(conflict.status).toBe(409);
    expect(await returnsCollection().countDocuments()).toBe(1);
  });

  it('denies another unit from returning the equipment', async () => {
    const equipment = await seedEquipment();
    const response = await request(appFor(otherUnitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-outside-scope').send({ equipmentId: equipment.id });
    expect(response.status).toBe(404);
    expect(await returnsCollection().countDocuments()).toBe(0);
  });

  it('does not allow DITEL to decide an AC return', async () => {
    const equipment = await seedEquipment();
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-ditel').send({ equipmentId: equipment.id });
    const response = await request(appFor(ditelContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Aceita', updatedAt: created.body.updatedAt });
    expect(response.status).toBe(403);
  });

  it('accepts a legacy unit equipment without custody and does not duplicate it', async () => {
    const equipment = await seedEquipment({ custody: null });
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-legacy').send({ equipmentId: equipment.id });
    const accepted = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Aceita', updatedAt: created.body.updatedAt });
    expect(accepted.status).toBe(200);
    expect(await EquipmentModel.countDocuments()).toBe(1);
    expect(accepted.body.status).toBe('Aguardando recebimento');
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: source, custody: null });
  });

  it('returns a conflict when the equipment changes before acceptance', async () => {
    const equipment = await seedEquipment();
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-stale').send({ equipmentId: equipment.id });
    await EquipmentModel.updateOne({ _id: equipment.id }, { $set: { situation: 'lost' } });
    const response = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Aceita', updatedAt: created.body.updatedAt });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Aguardando recebimento');
    expect(await returnsCollection().findOne({ _id: new mongoose.Types.ObjectId(created.body.id) })).toMatchObject({ status: 'Aguardando recebimento' });
  });

  it('blocks a return while a unit transfer is pending', async () => {
    const equipment = await seedEquipment();
    await MovementModel.create({ type: 'Transferência definitiva', equipmentId: equipment.id, origin: source, destination: otherUnit, requestedBy: unitContext.userId, status: 'Pendente' });
    const response = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-movement-conflict').send({ equipmentId: equipment.id });
    expect(response.status).toBe(409);
    expect(await returnsCollection().countDocuments()).toBe(0);
  });

  it('rolls back equipment and return when acceptance audit fails', async () => {
    const equipment = await seedEquipment();
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-audit-fail').send({ equipmentId: equipment.id });
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('simulated audit outage') as never);
    const response = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Aceita', updatedAt: created.body.updatedAt });
    expect(response.status).toBe(503);
    expect(await returnsCollection().findOne({ _id: new mongoose.Types.ObjectId(created.body.id) })).toMatchObject({ status: 'Pendente' });
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: source, custody: { scope: 'UNIT', unit: source } });
  });

  it('records and resolves a receiving divergence without releasing the lock before completion', async () => {
    const equipment = await seedEquipment();
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-divergence').send({ equipmentId: equipment.id });
    const accepted = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/decision`).set('Cookie', 'sigat_session=test').send({ status: 'Aceita', updatedAt: created.body.updatedAt });
    const divergence = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/receipt`).set('Cookie', 'sigat_session=test').send({ status: 'Divergência', updatedAt: accepted.body.updatedAt, description: 'Etiqueta ilegível.' });
    expect(divergence.status).toBe(200);
    expect(divergence.body.status).toBe('Divergência');
    expect(divergence.body.divergences[0]).toMatchObject({ description: 'Etiqueta ilegível.', resolutionStatus: 'pending' });
    const resumed = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/divergence`).set('Cookie', 'sigat_session=test').send({ action: 'retomar', updatedAt: divergence.body.updatedAt, resolution: 'Etiqueta conferida.' });
    expect(resumed.status).toBe(200);
    const received = await request(appFor(acContext)).patch(`/api/v1/ac/returns/${created.body.id}/receipt`).set('Cookie', 'sigat_session=test').send({ status: 'Recebida', updatedAt: resumed.body.updatedAt });
    expect(received.status).toBe(200);
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: null, custody: { scope: 'AC', unit: null } });
  });

  it('cancels a pending AC return with justification and keeps equipment custody unchanged', async () => {
    const equipment = await seedEquipment();
    const created = await request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-cancel').send({ equipmentId: equipment.id });
    const cancelled = await request(appFor(unitContext)).patch(`/api/v1/ac/returns/${created.body.id}/cancel`).set('Cookie', 'sigat_session=test').send({ updatedAt: created.body.updatedAt, reason: 'Recolhimento cancelado pela unidade.' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('Cancelada');
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ unit: source, custody: { scope: 'UNIT', unit: source } });
    const replay = await request(appFor(unitContext)).patch(`/api/v1/ac/returns/${created.body.id}/cancel`).set('Cookie', 'sigat_session=test').send({ updatedAt: created.body.updatedAt, reason: 'Repetição.' });
    expect(replay.status).toBe(409);
  });

  it('allows one pending return when identical requests race', async () => {
    const equipment = await seedEquipment();
    const responses = await Promise.all([1, 2].map(() => request(appFor(unitContext)).post('/api/v1/ac/returns').set('Cookie', 'sigat_session=test').set('Idempotency-Key', 'return-race').send({ equipmentId: equipment.id })));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(await returnsCollection().countDocuments()).toBe(1);
  });
});
