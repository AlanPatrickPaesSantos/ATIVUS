import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

const unit1 = { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' };
const unit2 = { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' };

function sessionServiceFor(context: SessionContext): SessionService {
  return { async login() { throw new Error('unused'); }, async getSessionContext() { return context; }, async logout() {}, async recordMissingSessionCookie() {} };
}

function inventoryRequest(context: SessionContext) {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .get('/api/v1/inventory').set('Cookie', 'sigat_session=test');
}

function inventoryFacetsRequest(context: SessionContext) {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .get('/api/v1/inventory/facets').set('Cookie', 'sigat_session=test');
}

async function seedUnits() {
  await UnitModel.deleteMany({});
  await UnitModel.create([
    { ...unit1, active: true, municipality: 'Belém', region: 'Metropolitana' },
    { ...unit2, active: true, municipality: 'Santarém', region: 'Baixo Amazonas' },
    { id: 'unit-3', name: 'Comando Intermediário', acronym: 'CI', active: true, kind: 'intermediate_command', municipality: 'Marabá', region: 'Sudeste' },
  ]);
}

async function seed() {
  await seedUnits();

  await EquipmentModel.create([
    {
      patrimony: 'PAT-001',
      type: 'Rádio',
      model: 'APX 2000',
      brand: 'Motorola',
      situation: 'active',
      location: 'Sala',
      unit: unit1,
      category: 'Comunicação',
      serialNumber: 'SN-001',
      warranty: '2027-08-20',
      observations: 'Equipamento operacional',
      createdBy: 'user-creator',
      updatedBy: 'user-updater',
      section: 'Telecom',
      history: [
        { id: 'initial', description: 'Cadastro inicial', occurredAt: new Date('2026-08-20T10:00:00.000Z') },
        { id: 'movement-1', description: 'Transferência para 1ª Companhia', occurredAt: new Date('2026-08-21T11:00:00.000Z') },
      ],
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      updatedAt: new Date('2026-08-21T11:00:00.000Z'),
    },
    { patrimony: 'PAT-002', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'maintenance', location: 'Suporte', section: 'Suporte', unit: unit1, createdAt: new Date('2026-08-21') },
    { patrimony: 'PAT-003', type: 'Impressora', model: 'LaserJet', brand: 'HP', situation: 'inactive', location: 'Almoxarifado', section: 'Administrativo', unit: unit2, createdAt: new Date('2026-08-22') },
  ]);

  const equipment = await EquipmentModel.findOne({ patrimony: 'PAT-001' }).orFail();
  await CallModel.create([
    {
      protocol: 'CH-2026-000001',
      problem: 'radio',
      priority: 'Alta',
      subject: 'Falha no rádio',
      description: 'Sem transmissão',
      section: 'Telecom',
      status: 'Aberto',
      unit: unit1,
      equipmentId: equipment.id,
      createdBy: 'user-creator',
      createdAt: new Date('2026-08-22T09:00:00.000Z'),
      updatedAt: new Date('2026-08-22T09:00:00.000Z'),
    },
    {
      protocol: 'CH-2026-000002',
      problem: 'hardware',
      priority: 'Média',
      subject: 'Outro chamado',
      description: 'Sem relação',
      section: 'Suporte',
      status: 'Aberto',
      unit: unit1,
      equipmentId: 'other-equipment-id',
      createdBy: 'user-creator',
      createdAt: new Date('2026-08-23T09:00:00.000Z'),
      updatedAt: new Date('2026-08-23T09:00:00.000Z'),
    },
  ]);
}

describe('inventory routes', () => {
  let mongoServer: MongoMemoryServer;
  beforeAll(async () => { mongoServer = await MongoMemoryServer.create(); await connectToDatabase(mongoServer.getUri()); await Promise.all([EquipmentModel.init(), UserModel.init(), SessionModel.init(), AuditEventModel.init(), CallModel.init(), UnitModel.init()]); });
  afterEach(async () => { await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))); });
  afterAll(async () => { await disconnectFromDatabase(); await mongoServer.stop(); });

  it('requires a session', async () => { expect((await request(createApp()).get('/api/v1/inventory')).status).toBe(401); });

  it('lists only the authenticated unit with filters, projection and pagination', async () => {
    await seed();
    const response = await inventoryRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 }).query({ search: 'motor', page: 1, pageSize: 1, unitId: 'unit-2' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], total: 0, page: 1, pageSize: 1 });
  });

  it('allows DITEL to filter by unit and returns deterministic order', async () => {
    await seed();
    const response = await inventoryRequest({ userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null }).query({ page: 1, pageSize: 10, unitId: 'unit-1' });
    expect(response.body.items.map((item: { patrimony: string }) => item.patrimony)).toEqual(['PAT-002', 'PAT-001']);
  });

  it('returns details with persisted category, history and linked calls, and 404 outside scope', async () => {
    await seed();
    const equipment = await EquipmentModel.findOne({ patrimony: 'PAT-001' }).orFail();
    const app = createApp({ sessionService: sessionServiceFor({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 }) });
    const detail = await request(app).get(`/api/v1/inventory/${equipment.id}`).set('Cookie', 'sigat_session=test');
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      patrimony: 'PAT-001',
      unitName: '1ª Companhia',
      serialNumber: 'SN-001',
      category: 'Comunicação',
      warranty: '2027-08-20',
      observations: 'Equipamento operacional',
      createdBy: 'user-creator',
      updatedBy: 'user-updater',
      allocation: { location: 'Sala' },
      history: [
        { id: 'initial', description: 'Cadastro inicial', occurredAt: '2026-08-20T10:00:00.000Z' },
        { id: 'movement-1', description: 'Transferência para 1ª Companhia', occurredAt: '2026-08-21T11:00:00.000Z' },
      ],
      linkedCalls: [
        {
          id: expect.any(String),
          subject: 'Falha no rádio',
          status: 'Aberto',
          openedAt: '2026-08-22T09:00:00.000Z',
        },
      ],
      documents: [],
    });
    const other = await EquipmentModel.findOne({ patrimony: 'PAT-003' }).orFail();
    expect((await request(app).get(`/api/v1/inventory/${other.id}`).set('Cookie', 'sigat_session=test')).status).toBe(404);
    expect((await request(app).get('/api/v1/inventory/not-an-object-id').set('Cookie', 'sigat_session=test')).status).toBe(404);
  });

  it.each([
    ['inactive', async () => {
      await UnitModel.updateOne({ id: unit1.id }, { $set: { active: false } });
    }],
    ['missing', async () => {
      await UnitModel.deleteOne({ id: unit1.id });
    }],
  ])('rejects GET /api/v1/inventory when the canonical unit is %s', async (_state, invalidateUnit) => {
    await seedUnits();
    await invalidateUnit();

    const response = await inventoryRequest({
      userId: 'u',
      name: 'Ana',
      registration: '1',
      role: 'unit_user',
      unit: unit1,
    }).query({ page: 1, pageSize: 20 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Escopo de unidade obrigatório.',
    });
  });

  it('rejects invalid pagination and invalid unit scope', async () => {
    await seedUnits();

    expect((await inventoryRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: null }).query({ page: 0, pageSize: 20 })).status).toBe(403);
    expect((await inventoryRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 }).query({ page: 0, pageSize: 20 })).status).toBe(400);
    expect((await inventoryRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 }).query({ page: 1, pageSize: 101 })).status).toBe(400);
  });

  it('returns dynamic facets including organizations without equipment and keeps them unit-scoped', async () => {
    await seed();

    const statewide = await inventoryFacetsRequest({ userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null });
    expect(statewide.status).toBe(200);
    expect(statewide.body).toEqual({
      units: [unit1, unit2, { id: 'unit-3', name: 'Comando Intermediário', acronym: 'CI' }],
      types: ['Impressora', 'Notebook', 'Rádio'],
      models: ['APX 2000', 'LaserJet', 'Latitude'],
      situations: ['active', 'inactive', 'maintenance'],
      municipalities: ['Belém', 'Marabá', 'Santarém'],
      regions: ['Baixo Amazonas', 'Metropolitana', 'Sudeste'],
      sections: ['Administrativo', 'Suporte', 'Telecom'],
    });

    const unitOnly = await inventoryFacetsRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 });
    expect(unitOnly.status).toBe(200);
    expect(unitOnly.body.units).toEqual([unit1]);
    expect(unitOnly.body.types).toEqual(['Notebook', 'Rádio']);
    expect(unitOnly.body.sections).toEqual(['Suporte', 'Telecom']);
    expect(unitOnly.body.municipalities).toEqual(['Belém']);
  });

  it('applies metadata and section filters on the server without allowing unit escape', async () => {
    await seed();

    const response = await inventoryRequest({ userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null })
      .query({ municipality: 'Belém', region: 'Metropolitana', section: 'Telecom', page: 1, pageSize: 20 });

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { patrimony: string }) => item.patrimony)).toEqual(['PAT-001']);

    const denied = await inventoryRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 })
      .query({ unitId: 'unit-2', municipality: 'Santarém', page: 1, pageSize: 20 });
    expect(denied.status).toBe(200);
    expect(denied.body.total).toBe(0);
    expect(denied.body.items).toEqual([]);
  });

  it('filters inventory by command descendants without including another command', async () => {
    await UnitModel.create([
      { id: 'command-a', name: 'CPRM', acronym: 'CPRM', kind: 'intermediate_command', active: true },
      { id: 'region-a', name: 'Região A', acronym: 'RA', parentUnitId: 'command-a', kind: 'other', active: true },
      { id: 'unit-a', name: 'Unidade A', acronym: 'UA', parentUnitId: 'region-a', kind: 'bpm', active: true },
      { id: 'command-b', name: 'CPS', acronym: 'CPS', kind: 'intermediate_command', active: true },
      { id: 'unit-b', name: 'Unidade B', acronym: 'UB', parentUnitId: 'command-b', kind: 'bpm', active: true },
    ]);
    await EquipmentModel.collection.insertMany([
      { patrimony: 'CMD-A', type: 'Rádio', model: 'A', brand: 'A', situation: 'active', location: 'Sala', unit: { id: 'unit-a', name: 'Unidade A', acronym: 'UA' }, createdAt: new Date(), updatedAt: new Date() },
      { patrimony: 'CMD-B', type: 'Rádio', model: 'B', brand: 'B', situation: 'active', location: 'Sala', unit: { id: 'unit-b', name: 'Unidade B', acronym: 'UB' }, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const response = await inventoryRequest({ userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null }).query({ commandId: 'command-a', page: 1, pageSize: 20 });
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { patrimony: string }) => item.patrimony)).toEqual(['CMD-A']);
  });
});
