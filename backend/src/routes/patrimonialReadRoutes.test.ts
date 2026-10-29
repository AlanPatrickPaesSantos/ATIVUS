import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type SessionContext, type SessionService } from '../auth/sessionService.js';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AcReturnModel } from '../models/AcReturn.js';
import { AcTransferModel } from '../models/AcTransfer.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { MovementModel } from '../models/Movement.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

const unitA = { id: 'unit-a', name: 'Unidade A', acronym: 'UA' };
const unitB = { id: 'unit-b', name: 'Unidade B', acronym: 'UB' };
const unitContext: SessionContext = { userId: 'user-a', name: 'Usuário A', registration: '100001', role: 'unit_user', unit: unitA };
const otherUnitContext: SessionContext = { userId: 'user-b', name: 'Usuário B', registration: '100002', role: 'unit_user', unit: unitB };
const acContext: SessionContext = { userId: 'ac-user', name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null };
const ditelContext: SessionContext = { userId: 'ditel-user', name: 'Admin DITEL', registration: '200001', role: 'ditel_admin', unit: null };

function appFor(context?: SessionContext): express.Express {
  const sessionService: SessionService = {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
  return createApp({ sessionService });
}

function readRequest(context: SessionContext, equipmentId: string, query?: Record<string, string>) {
  return request(appFor(context))
    .get(`/api/v1/inventory/${equipmentId}/patrimonial`)
    .set('Cookie', 'sigat_session=test')
    .query(query ?? {});
}

describe('integrated patrimonial read route', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([
      AcReturnModel.init(), AcTransferModel.init(), AuditEventModel.init(), CallModel.init(),
      EquipmentModel.init(), MovementModel.init(), SessionModel.init(), UnitModel.init(), UserModel.init(),
    ]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('returns persisted custody, pending operation and paginated history without exposing writes', async () => {
    await UnitModel.create([{ ...unitA, active: true }, { ...unitB, active: true }]);
    const equipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-001', type: 'Rádio', model: 'X', brand: 'Marca', situation: 'active', location: 'Sala',
      unit: unitA, custody: { scope: 'UNIT', unit: unitA },
      history: [
        { id: 'history-1', description: 'Cadastro inicial', occurredAt: new Date('2026-01-01T10:00:00.000Z') },
        { id: 'history-2', description: 'Alocado na sala', occurredAt: new Date('2026-01-02T10:00:00.000Z') },
      ],
    });
    await MovementModel.create({
      type: 'Transferência definitiva', equipmentId: equipment.id, origin: unitA, destination: unitB,
      requestedBy: unitContext.userId, status: 'Pendente',
    });
    await CallModel.create({
      protocol: 'CH-READ-001', problem: 'radio', priority: 'Média', subject: 'Ruído no rádio', description: 'Verificar áudio',
      section: 'Telecom', status: 'Aberto', unit: unitA, equipmentId: equipment.id, createdBy: unitContext.userId,
    });
    await AuditEventModel.create({
      action: 'equipment.situation.update', module: 'inventory', userId: unitContext.userId,
      entity: { type: 'equipment', id: equipment.id, label: equipment.patrimony }, unit: unitA,
      result: 'success', before: { situation: 'maintenance' }, after: { situation: 'active' },
    });

    const response = await readRequest(unitContext, equipment.id, { historyPage: '1', historyPageSize: '1' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      equipment: {
        id: equipment.id, patrimony: 'RP-INTEGRATED-001', situation: 'active',
        unit: unitA, custody: { scope: 'UNIT', unit: unitA },
      },
      activeOperation: {
        kind: 'unit_transfer', status: 'Pendente', equipmentId: equipment.id,
        origin: unitA, destination: unitB,
      },
      history: { page: 1, pageSize: 1, total: 3, items: [{ id: expect.stringContaining('movement-'), source: 'movement' }] },
      relatedCalls: [{ protocol: 'CH-READ-001', subject: 'Ruído no rádio' }],
      documents: [],
      auditEvents: { items: [], total: 0, page: 1, pageSize: 20 },
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('tokenDigest');
  });

  it('returns completed operations and preserves AC return divergence history without treating them as active', async () => {
    await UnitModel.create([{ ...unitA, active: true }, { ...unitB, active: true }]);
    const equipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-002', type: 'Notebook', model: 'Y', brand: 'Marca', situation: 'active', location: 'Sala',
      unit: unitA, custody: { scope: 'UNIT', unit: unitA },
      history: [{ id: 'history-terminal', description: 'Recebimento confirmado', occurredAt: new Date('2026-02-01T10:00:00.000Z') }],
    });
    await MovementModel.create({
      type: 'Transferência definitiva', equipmentId: equipment.id, origin: unitA, destination: unitB,
      requestedBy: unitContext.userId, status: 'Recebida', createdAt: new Date('2026-02-01T11:00:00.000Z'), updatedAt: new Date('2026-02-01T12:00:00.000Z'),
    });
    await AcReturnModel.create({
      equipmentId: equipment.id, origin: unitB, requestedBy: otherUnitContext.userId, requestReason: 'Conferência', status: 'Divergência',
      equipment: { patrimony: equipment.patrimony, type: equipment.type, model: equipment.model, brand: equipment.brand, situation: equipment.situation, unit: unitB, custody: { scope: 'UNIT', unit: unitB }, equipmentUpdatedAt: equipment.updatedAt, equipmentVersion: 0 },
      idempotencyKey: 'read-return-1', fingerprint: 'read-return-fingerprint', createdAt: new Date('2026-02-02T10:00:00.000Z'), updatedAt: new Date('2026-02-02T11:00:00.000Z'),
      divergences: [{ description: 'Etiqueta ilegível', reportedBy: otherUnitContext.userId, reportedAt: new Date('2026-02-02T11:00:00.000Z'), resolutionStatus: 'pending' }],
    });

    const response = await readRequest(ditelContext, equipment.id);

    expect(response.status).toBe(200);
    expect(response.body.activeOperation).toMatchObject({ kind: 'ac_return', status: 'Divergência', divergenceCount: 1 });
    expect(response.body.history.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'movement', status: 'Recebida' }),
      expect.objectContaining({ source: 'ac_return', status: 'Pendente', snapshot: expect.objectContaining({ patrimony: equipment.patrimony }) }),
      expect.objectContaining({ source: 'ac_return', status: 'Divergência' }),
    ]));
  });

  it('applies role scope and exposes audit events only to DITEL', async () => {
    await UnitModel.create([{ ...unitA, active: true }, { ...unitB, active: true }]);
    const unitEquipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-003', type: 'Rádio', model: 'Z', brand: 'Marca', situation: 'active', location: 'Sala', unit: unitA,
      custody: { scope: 'UNIT', unit: unitA },
    });
    const acEquipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-004', type: 'Rádio', model: 'AC', brand: 'Marca', situation: 'active', location: 'AC', unit: null,
      custody: { scope: 'AC', unit: null },
    });
    await CallModel.create({ protocol: 'CH-READ-SCOPE-001', problem: 'radio', priority: 'Alta', subject: 'Chamado de outra unidade', description: 'Não deve vazar', section: 'Telecom', status: 'Aberto', unit: unitB, equipmentId: unitEquipment.id, createdBy: otherUnitContext.userId });
    await AuditEventModel.create({ action: 'equipment.situation.update', module: 'inventory', userId: ditelContext.userId, entity: { type: 'equipment', id: unitEquipment.id, label: unitEquipment.patrimony }, unit: unitA, result: 'success', before: {}, after: {} });

    expect((await readRequest(otherUnitContext, unitEquipment.id)).status).toBe(404);
    expect((await readRequest(acContext, unitEquipment.id)).status).toBe(404);
    expect((await readRequest(unitContext, acEquipment.id)).status).toBe(404);
    expect((await readRequest(acContext, acEquipment.id)).status).toBe(200);
    const unitView = await readRequest(unitContext, unitEquipment.id);
    expect(unitView.status).toBe(200);
    expect(unitView.body.relatedCalls).toEqual([]);
    const ditel = await readRequest(ditelContext, unitEquipment.id, { auditPage: '1', auditPageSize: '1' });
    expect(ditel.status).toBe(200);
    expect(ditel.body.auditEvents).toMatchObject({ total: 1, page: 1, pageSize: 1, items: [{ action: 'equipment.situation.update' }] });
    expect(ditel.body.relatedCalls).toEqual([{ protocol: 'CH-READ-SCOPE-001', subject: 'Chamado de outra unidade', status: 'Aberto', id: expect.any(String), openedAt: expect.any(String) }]);
  });

  it('returns an empty operation history and stable results under concurrent reads', async () => {
    await UnitModel.create({ ...unitA, active: true });
    const equipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-005', type: 'Impressora', model: 'W', brand: 'Marca', situation: 'maintenance', location: 'Suporte', unit: unitA,
      custody: { scope: 'UNIT', unit: unitA }, history: [],
    });
    const responses = await Promise.all(Array.from({ length: 4 }, () => readRequest(unitContext, equipment.id)));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.map((response) => response.body.activeOperation)).toEqual([null, null, null, null]);
    expect(responses.map((response) => response.body.history.total)).toEqual([0, 0, 0, 0]);
  });

  it('reads a completed AC return from persisted AC custody and supports legacy unit custody', async () => {
    await UnitModel.create({ ...unitA, active: true });
    const acEquipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-007', type: 'Rádio', model: 'AC', brand: 'Marca', situation: 'active', location: 'AC', unit: null,
      custody: { scope: 'AC', unit: null }, history: [{ id: 'ac-received', description: 'Recebido pela AC', occurredAt: new Date('2026-03-01T10:00:00.000Z') }],
    });
    await AcReturnModel.create({
      equipmentId: acEquipment.id, origin: unitA, requestedBy: unitContext.userId, status: 'Recebida', decidedAt: new Date('2026-03-01T09:00:00.000Z'),
      equipment: { patrimony: acEquipment.patrimony, type: acEquipment.type, model: acEquipment.model, brand: acEquipment.brand, situation: acEquipment.situation, unit: unitA, custody: { scope: 'UNIT', unit: unitA }, equipmentUpdatedAt: acEquipment.updatedAt, equipmentVersion: 0 },
      idempotencyKey: 'read-return-completed', fingerprint: 'read-return-completed-fingerprint', createdAt: new Date('2026-02-28T10:00:00.000Z'), updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    });
    const legacyUnitEquipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-008', type: 'Rádio', model: 'Legacy', brand: 'Marca', situation: 'active', location: 'Sala', unit: unitA, custody: null,
    });

    const acView = await readRequest(acContext, acEquipment.id);
    const legacyView = await readRequest(unitContext, legacyUnitEquipment.id);
    expect(acView.status).toBe(200);
    expect(acView.body.equipment).toMatchObject({ unit: null, custody: { scope: 'AC', unit: null } });
    expect(acView.body.activeOperation).toBeNull();
    expect(acView.body.history.items).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'ac_return', status: 'Recebida' })]));
    expect(legacyView.status).toBe(200);
    expect(legacyView.body.equipment.custody).toBeNull();
  });

  it('rejects invalid history pagination without touching patrimonial data', async () => {
    await UnitModel.create({ ...unitA, active: true });
    const equipment = await EquipmentModel.create({
      patrimony: 'RP-INTEGRATED-006', type: 'Rádio', model: 'Q', brand: 'Marca', situation: 'active', location: 'Sala', unit: unitA,
      custody: { scope: 'UNIT', unit: unitA },
    });
    const response = await readRequest(unitContext, equipment.id, { historyPage: '0' });
    expect(response.status).toBe(400);
    expect(await EquipmentModel.findById(equipment.id).lean()).toMatchObject({ patrimony: equipment.patrimony, unit: unitA, custody: { scope: 'UNIT', unit: unitA } });
  });
});
