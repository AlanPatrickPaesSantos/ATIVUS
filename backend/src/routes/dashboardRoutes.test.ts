import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);

  await Promise.all(collections.map(async (collection) => collection.deleteMany({})));
}

async function seedEquipment() {
  const database = mongoose.connection.db;

  if (!database) {
    throw new Error('MongoDB connection is not available');
  }

  await database.collection('equipment').insertMany([
    {
      patrimony: 'PAT-001',
      type: 'Rádio',
      model: 'APX 2000',
      brand: 'Motorola',
      situation: 'active',
      location: 'Sala de Comunicações',
      unit: {
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
      },
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    },
    {
      patrimony: 'PAT-002',
      type: 'Notebook',
      model: 'Latitude 5420',
      brand: 'Dell',
      situation: 'maintenance',
      location: 'Suporte',
      unit: {
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
      },
      createdAt: new Date('2026-08-21T10:00:00.000Z'),
      updatedAt: new Date('2026-08-21T10:00:00.000Z'),
    },
    {
      patrimony: 'PAT-003',
      type: 'Impressora',
      model: 'LaserJet M404',
      brand: 'HP',
      situation: 'inactive',
      location: 'Almoxarifado',
      unit: {
        id: 'unit-2',
        name: '2ª Companhia',
        acronym: '2CIA',
      },
      createdAt: new Date('2026-08-22T10:00:00.000Z'),
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    },
    {
      patrimony: 'PAT-004',
      type: 'Tablet',
      model: 'Tab Active',
      brand: 'Samsung',
      situation: 'lost',
      location: 'Reserva',
      unit: {
        id: 'unit-2',
        name: '2ª Companhia',
        acronym: '2CIA',
      },
      createdAt: new Date('2026-08-23T10:00:00.000Z'),
      updatedAt: new Date('2026-08-23T10:00:00.000Z'),
    },
  ]);
}

async function loginAsUnitUser() {
  await UnitModel.updateOne(
    { id: 'unit-1' },
    {
      $set: {
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
        active: true,
      },
    },
    { upsert: true },
  );

  await UserModel.create({
    name: 'Ana Martins',
    registration: '12345',
    role: 'unit_user',
    active: true,
    unit: {
      id: 'unit-1',
      name: '1ª Companhia',
      acronym: '1CIA',
    },
    password: 'senha-segura-123',
  });

  const agent = request.agent(createApp());
  const loginResponse = await agent.post('/api/v1/auth/login').send({
    registration: '12345',
    password: 'senha-segura-123',
  });

  expect(loginResponse.status).toBe(200);

  return agent;
}

async function loginAsDitelAdmin() {
  await UserModel.create({
    name: 'Carlos Lima',
    registration: '54321',
    role: 'ditel_admin',
    active: true,
    unit: null,
    password: 'segredo-admin',
  });

  const agent = request.agent(createApp());
  const loginResponse = await agent.post('/api/v1/auth/login').send({
    registration: '54321',
    password: 'segredo-admin',
  });

  expect(loginResponse.status).toBe(200);

  return agent;
}

function sessionServiceFor(context: SessionContext): SessionService {
  return {
    async login() {
      throw new Error('Login is not used by this test');
    },
    async getSessionContext() {
      return context;
    },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
}

function getDashboardWithSession(context: SessionContext) {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .get('/api/v1/dashboard')
    .set('Cookie', 'sigat_session=test-session');
}

describe('dashboard routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    await connectToDatabase(mongoServer.getUri());
    await Promise.all([UserModel.init(), SessionModel.init(), AuditEventModel.init(), UnitModel.init()]);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('rejects GET /api/v1/dashboard without a session', async () => {
    const response = await request(createApp()).get('/api/v1/dashboard');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
  });

  it('rejects a unit user without a Unit instead of granting statewide access', async () => {
    const response = await getDashboardWithSession({
      userId: 'legacy-user-without-unit',
      name: 'Usuário legado',
      registration: '20000',
      role: 'unit_user',
      unit: null,
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Escopo de unidade obrigatório.',
    });
  });

  it('rejects a unit user when the Unit property is absent', async () => {
    const response = await getDashboardWithSession({
      userId: 'legacy-user-with-absent-unit',
      name: 'Usuário legado',
      registration: '20002',
      role: 'unit_user',
    } as SessionContext);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Escopo de unidade obrigatório.',
    });
  });

  it('rejects a unit user whose Unit is an empty object', async () => {
    const response = await getDashboardWithSession({
      userId: 'legacy-user-with-empty-unit',
      name: 'Usuário legado',
      registration: '20003',
      role: 'unit_user',
      unit: {} as SessionContext['unit'],
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Escopo de unidade obrigatório.',
    });
  });

  it.each([
    ['empty', { id: '', name: '1ª Companhia', acronym: '1CIA' }],
    ['absent', { name: '1ª Companhia', acronym: '1CIA' }],
  ])('rejects a unit user whose Unit id is %s', async (_case, unit) => {
    const response = await getDashboardWithSession({
      userId: 'legacy-user-with-invalid-unit',
      name: 'Usuário legado',
      registration: '20001',
      role: 'unit_user',
      unit: unit as SessionContext['unit'],
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Escopo de unidade obrigatório.',
    });
  });

  it.each([
    ['inactive', async () => {
      await UnitModel.create({
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
        active: false,
      });
    }],
    ['missing', async () => {}],
  ])('rejects a unit user whose canonical unit is %s', async (_state, arrangeUnit) => {
    await arrangeUnit();

    const response = await getDashboardWithSession({
      userId: 'legacy-user-with-inactive-unit',
      name: 'Usuário legado',
      registration: '20004',
      role: 'unit_user',
      unit: {
        id: 'unit-1',
        name: 'Unidade adulterada',
        acronym: 'XXX',
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Escopo de unidade obrigatório.',
    });
  });

  it('returns the dashboard scoped to the authenticated unit even when unitId is sent by the client', async () => {
    await seedEquipment();
    const agent = await loginAsUnitUser();

    const response = await agent.get('/api/v1/dashboard').query({ unitId: 'unit-2' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      unit: {
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
      },
      metrics: {
        total: 2,
        active: 1,
        maintenance: 1,
        attention: 0,
      },
      situations: [
        { situation: 'active', label: 'Em operação', count: 1 },
        { situation: 'maintenance', label: 'Em manutenção', count: 1 },
        { situation: 'attention', label: 'Requer atenção', count: 0 },
      ],
      recentActivity: [],
    });
  });

  it('returns the statewide dashboard for a ditel administrator', async () => {
    await seedEquipment();
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      unit: {
        id: 'statewide',
        name: 'Estado do Pará',
        acronym: 'DITEL',
      },
      metrics: {
        total: 4,
        active: 1,
        maintenance: 1,
        attention: 2,
      },
      situations: [
        { situation: 'active', label: 'Em operação', count: 1 },
        { situation: 'maintenance', label: 'Em manutenção', count: 1 },
        { situation: 'attention', label: 'Requer atenção', count: 2 },
      ],
      recentActivity: [],
    });
  });

  it('keeps DITEL statewide when the client sends a unitId and counts written-off equipment as attention', async () => {
    await seedEquipment();
    const database = mongoose.connection.db;

    if (!database) {
      throw new Error('MongoDB connection is not available');
    }

    await database.collection('equipment').insertOne({
      patrimony: 'PAT-005',
      type: 'Rádio',
      model: 'APX 8000',
      brand: 'Motorola',
      situation: 'written_off',
      location: 'Almoxarifado',
      unit: {
        id: 'unit-2',
        name: '2ª Companhia',
        acronym: '2CIA',
      },
      createdAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    });
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/dashboard').query({ unitId: 'unit-1' });

    expect(response.status).toBe(200);
    expect(response.body.unit).toEqual({
      id: 'statewide',
      name: 'Estado do Pará',
      acronym: 'DITEL',
    });
    expect(response.body.metrics).toEqual({
      total: 5,
      active: 1,
      maintenance: 1,
      attention: 3,
    });
    expect(response.body.situations).toContainEqual({
      situation: 'attention',
      label: 'Requer atenção',
      count: 3,
    });
  });
});
