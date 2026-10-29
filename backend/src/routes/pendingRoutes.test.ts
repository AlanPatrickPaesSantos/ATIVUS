import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AcReturnModel } from '../models/AcReturn.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { MaintenanceModel } from '../models/Maintenance.js';
import { MissionModel } from '../models/Mission.js';
import { MovementModel } from '../models/Movement.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

const unit1 = { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' };
const unit2 = { id: 'unit-2', name: 'Unidade 2', acronym: 'U2' };
const cookie = 'sigat_session=test';

function app(context: SessionContext) {
  const service: SessionService = { async login() { throw new Error('unused'); }, async getSessionContext() { return context; }, async logout() {}, async recordMissingSessionCookie() {} };
  return createApp({ sessionService: service });
}

describe('pending operations routes', () => {
  let server: MongoMemoryReplSet;
  beforeAll(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(server.getUri());
    await Promise.all([AcReturnModel.init(), CallModel.init(), EquipmentModel.init(), MaintenanceModel.init(), MissionModel.init(), MovementModel.init(), SessionModel.init(), UnitModel.init(), UserModel.init()]);
  });
  afterEach(async () => { await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))); });
  afterAll(async () => { await disconnectFromDatabase(); await server.stop(); });

  async function seed() {
    await UnitModel.create([{ ...unit1, active: true }, { ...unit2, active: true }]);
    const [equipment] = await EquipmentModel.create([{ patrimony: 'RP-PEND-1', type: 'Rádio', model: 'M1', brand: 'B', situation: 'active', location: 'Sala', unit: unit1 }]);
    await MovementModel.create({ type: 'Transferência definitiva', equipmentId: String(equipment._id), origin: unit1, destination: unit2, requestedBy: 'u1', status: 'Pendente', createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01') });
    await AcReturnModel.create({ equipmentId: String(equipment._id), origin: unit1, requestedBy: 'u1', status: 'Aguardando recebimento', equipment: { patrimony: equipment.patrimony, type: equipment.type, model: equipment.model, brand: equipment.brand, situation: equipment.situation, unit: unit1, custody: { scope: 'UNIT', unit: unit1 }, equipmentUpdatedAt: equipment.updatedAt, equipmentVersion: 0 }, idempotencyKey: 'pending-test-return', fingerprint: 'pending-test-fingerprint' });
    await CallModel.create({ protocol: 'CH-001', problem: 'hardware', priority: 'Alta', subject: 'Falha no rádio', description: 'Sem áudio', section: 'Suporte', status: 'Aberto', unit: unit1, createdBy: 'u1', createdAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-02') });
    await MaintenanceModel.create({ equipmentId: String(equipment._id), equipment: { id: String(equipment._id), patrimony: equipment.patrimony, type: equipment.type, model: equipment.model, brand: equipment.brand }, unit: unit1, status: 'open', type: 'corretiva', description: 'Verificar rádio', openedAt: new Date('2026-10-03'), updatedAt: new Date('2026-10-03') });
    await MissionModel.create({ title: 'Inspeção', description: 'Inspecionar equipamento', type: 'inspection', status: 'assigned', unit: unit1, equipment: [], assignedBy: { id: 'd', name: 'Ditel', registration: '1' }, assignedTo: { id: 'u1', name: 'Usuário', registration: '2' }, priority: 'high', createdAt: new Date('2026-10-04'), updatedAt: new Date('2026-10-04') });
    return equipment;
  }

  it('aggregates pending sources, orders them deterministically and returns counts', async () => {
    await seed();
    const response = await request(app({ userId: 'ditel', name: 'Ditel', registration: '1', role: 'ditel_admin', unit: null })).get('/api/v1/pending-operations?page=1&pageSize=2').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 5, page: 1, pageSize: 2, totalPages: 3 });
    expect(response.body.items.map((item: { source: string }) => item.source)).toEqual(['maintenance', 'ac_return']);
    expect(response.body.counts).toEqual(expect.arrayContaining([{ source: 'movement', total: 1 }, { source: 'call', total: 1 }]));
  });

  it('enforces unit isolation before totals and filters', async () => {
    await seed();
    await CallModel.create({ protocol: 'CH-002', problem: 'network', priority: 'Baixa', subject: 'Outra unidade', description: 'Não deve vazar', section: 'Suporte', status: 'Aberto', unit: unit2, createdBy: 'u2' });
    const response = await request(app({ userId: 'unit', name: 'Unidade', registration: '2', role: 'unit_user', unit: unit1 })).get('/api/v1/pending-operations?unitId=unit-2').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    const own = await request(app({ userId: 'unit', name: 'Unidade', registration: '2', role: 'unit_user', unit: unit1 })).get('/api/v1/pending-operations').set('Cookie', cookie);
    expect(own.body.items.every((item: { unitId: string }) => item.unitId === unit1.id)).toBe(true);
    expect(own.body.items.some((item: { source: string }) => item.source === 'movement')).toBe(true);
  });

  it('limits AC operators to AC returns and excludes terminal states', async () => {
    await seed();
    const response = await request(app({ userId: 'ac', name: 'AC', registration: '3', role: 'ac_operator', unit: null })).get('/api/v1/pending-operations').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 1 });
    expect(response.body.items[0].source).toBe('ac_return');
    const terminal = await request(app({ userId: 'ditel', name: 'Ditel', registration: '1', role: 'ditel_admin', unit: null })).get('/api/v1/pending-operations?state=Recebida').set('Cookie', cookie);
    expect(terminal.body).toMatchObject({ total: 0, items: [] });
    const invalid = await request(app({ userId: 'ditel', name: 'Ditel', registration: '1', role: 'ditel_admin', unit: null })).get('/api/v1/pending-operations?page=0&pageSize=101&source=unknown').set('Cookie', cookie);
    expect(invalid.status).toBe(400);
  });
});
