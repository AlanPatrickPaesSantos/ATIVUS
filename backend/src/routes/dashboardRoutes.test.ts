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
      section: 'Telecom',
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
      section: 'Suporte',
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
      section: 'Administrativo',
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
      section: 'Operações',
      createdAt: new Date('2026-08-23T10:00:00.000Z'),
      updatedAt: new Date('2026-08-23T10:00:00.000Z'),
    },
  ]);

  await UnitModel.create([
    { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA', active: true, municipality: 'Belém', region: 'Metropolitana' },
    { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA', active: true, municipality: 'Santarém', region: 'Baixo Amazonas' },
  ]);

  await database.collection('calls').insertMany([
    {
      protocol: 'ATIVUS-2026-0001',
      problem: 'radio',
      priority: 'Crítica',
      subject: 'Falha no rádio operacional',
      description: 'Rádio sem transmissão durante operação.',
      section: 'Telecom',
      status: 'Aberto',
      unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
      equipmentId: null,
      createdBy: 'usuário-teste',
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    },
    {
      protocol: 'ATIVUS-2026-0002',
      problem: 'printer',
      priority: 'Alta',
      subject: 'Impressora sem conexão',
      description: 'Impressora da administração fora da rede.',
      section: 'Suporte',
      status: 'Em atendimento',
      unit: { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' },
      equipmentId: null,
      createdBy: 'usuário-teste',
      createdAt: new Date('2026-09-02T10:00:00.000Z'),
      updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    },
    {
      protocol: 'ATIVUS-2026-0003',
      problem: 'software',
      priority: 'Média',
      subject: 'GPS desatualizado',
      description: 'Atualização de mapas do GPS.',
      section: 'Suporte',
      status: 'Resolvido',
      unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
      equipmentId: null,
      createdBy: 'usuário-teste',
      createdAt: new Date('2026-09-03T10:00:00.000Z'),
      updatedAt: new Date('2026-09-03T10:00:00.000Z'),
    },
  ]);

  await database.collection('movements').insertMany([
    {
      type: 'Transferência definitiva',
      equipmentId: 'PAT-004',
      origin: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
      destination: { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' },
      requestedBy: 'usuário-teste',
      status: 'Pendente',
      createdAt: new Date('2026-09-04T10:00:00.000Z'),
      updatedAt: new Date('2026-09-04T10:00:00.000Z'),
    },
  ]);
}

async function seedHierarchicalEquipment() {
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is not available');
  await UnitModel.create([
    { id: 'command-north', name: 'CPRM', acronym: 'CPRM', kind: 'intermediate_command', active: true },
    { id: 'region-north', name: 'Região Norte', acronym: 'RN', parentUnitId: 'command-north', kind: 'other', active: true },
    { id: 'unit-north-a', name: '1º BPM', acronym: '1BPM', parentUnitId: 'region-north', kind: 'bpm', active: true, municipality: 'Belém', region: 'Metropolitana' },
    { id: 'unit-north-b', name: '2º BPM', acronym: '2BPM', parentUnitId: 'command-north', kind: 'bpm', active: true, municipality: 'Ananindeua', region: 'Metropolitana' },
    { id: 'command-south', name: 'CPS', acronym: 'CPS', kind: 'intermediate_command', active: true },
    { id: 'unit-south', name: '3º BPM', acronym: '3BPM', parentUnitId: 'command-south', kind: 'bpm', active: true, municipality: 'Santarém', region: 'Baixo Amazonas' },
  ]);
  await database.collection('equipment').insertMany([
    { patrimony: 'NORTH-1', type: 'Rádio', model: 'M1', brand: 'A', situation: 'active', location: 'Sala', unit: { id: 'unit-north-a', name: '1º BPM', acronym: '1BPM' }, section: 'Telecom', createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01') },
    { patrimony: 'NORTH-2', type: 'Notebook', model: 'M2', brand: 'B', situation: 'maintenance', location: 'Sala', unit: { id: 'unit-north-b', name: '2º BPM', acronym: '2BPM' }, section: 'Suporte', createdAt: new Date('2026-08-02'), updatedAt: new Date('2026-08-02') },
    { patrimony: 'SOUTH-1', type: 'Impressora', model: 'M3', brand: 'C', situation: 'active', location: 'Sala', unit: { id: 'unit-south', name: '3º BPM', acronym: '3BPM' }, section: 'Administrativo', createdAt: new Date('2026-08-03'), updatedAt: new Date('2026-08-03') },
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
    expect(response.body.unit).toEqual({ id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' });
    expect(response.body.metrics).toEqual({ total: 0, active: 0, maintenance: 0, attention: 0 });
    expect(response.body.situations).toEqual([
      { situation: 'active', label: 'Em operação', count: 0 },
      { situation: 'maintenance', label: 'Em manutenção', count: 0 },
      { situation: 'inactive', label: 'Inativos', count: 0 },
      { situation: 'attention', label: 'Requer atenção', count: 0 },
    ]);
    expect(response.body.unitSummaries).toEqual([]);
    expect(response.body.callsByStatus).toEqual([]);
    expect(response.body.criticalCalls).toBe(0);
    expect(response.body.pendingMovements).toBe(0);
    expect(response.body.monitoredUnits).toBe(0);
    expect(response.body.recentActivity).toEqual([]);
    expect(response.body.recentMovements).toEqual([]);
  });

  it('returns the statewide dashboard for a ditel administrator', async () => {
    await seedEquipment();
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      unit: {
        id: 'statewide',
        name: 'Estado do Pará',
        acronym: 'DITEL',
      },
      metrics: {
        total: 4,
        active: 1,
        maintenance: 1,
        attention: 1,
      },
      situations: [
        { situation: 'active', label: 'Em operação', count: 1 },
        { situation: 'maintenance', label: 'Em manutenção', count: 1 },
        { situation: 'inactive', label: 'Inativos', count: 1 },
        { situation: 'attention', label: 'Requer atenção', count: 1 },
      ],
      recentActivity: [
        expect.objectContaining({
          description: 'Chamado Resolvido: ATIVUS-2026-0003',
        }),
        expect.objectContaining({
          description: 'Chamado Em atendimento: ATIVUS-2026-0002',
        }),
        expect.objectContaining({
          description: 'Chamado Aberto: ATIVUS-2026-0001',
        }),
      ],
      unitSummaries: [
        { unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' }, coverage: '50%', equipment: 2, attention: 0 },
        { unit: { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' }, coverage: '50%', equipment: 2, attention: 1 },
      ],
      callsByStatus: [
        { status: 'Aberto', label: 'Aberto', count: 1 },
        { status: 'Em atendimento', label: 'Em atendimento', count: 1 },
        { status: 'Resolvido', label: 'Resolvido', count: 1 },
      ],
      criticalCalls: 1,
      pendingMovements: 1,
      monitoredUnits: 2,
      recentMovements: [
        {
          equipmentId: 'PAT-004',
          origin: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
          destination: { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' },
          status: 'Pendente',
        },
      ],
    });
  });

  it('returns explicit operational indicators and command aggregates without patrimonial coverage claims', async () => {
    await seedEquipment();
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.operationalIndicators).toEqual({
      total: 4,
      active: 1,
      maintenance: 1,
      inactive: 1,
      lost: 1,
      writtenOff: 0,
      attention: 1,
      attentionPercent: 25,
    });
    expect(response.body.commandSummaries).toEqual([]);
    expect(response.body.unitSummaries[0]).toMatchObject({
      equipmentShare: '50%',
      patrimonialCoverage: null,
    });
  });

  it('aggregates command descendants into a command comparison summary', async () => {
    await seedHierarchicalEquipment();
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.commandSummaries).toEqual([
      expect.objectContaining({
        command: { id: 'command-north', name: 'CPRM', acronym: 'CPRM' },
        equipment: 2,
        attention: 0,
        attentionPercent: 0,
      }),
      expect.objectContaining({
        command: { id: 'command-south', name: 'CPS', acronym: 'CPS' },
        equipment: 1,
        attention: 0,
        attentionPercent: 0,
      }),
    ]);
  });

  it('applies a DITEL unitId filter while retaining statewide response identity', async () => {
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
    expect(response.body.metrics).toEqual({ total: 2, active: 1, maintenance: 1, attention: 0 });
    expect(response.body.situations).toContainEqual({ situation: 'inactive', label: 'Inativos', count: 0 });
    expect(response.body.situations).toContainEqual({ situation: 'attention', label: 'Requer atenção', count: 0 });
  });

  it('returns statewide unit summaries, call indicators, pending movements and recent activity for DITEL without secrets', async () => {
    await seedEquipment();
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.unitSummaries).toEqual([
      {
        unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
        coverage: '50%',
        equipmentShare: '50%',
        patrimonialCoverage: null,
        equipment: 2,
        attention: 0,
        organizationType: 'subordinate_unit',
      },
      {
        unit: { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' },
        coverage: '50%',
        equipmentShare: '50%',
        patrimonialCoverage: null,
        equipment: 2,
        attention: 1,
        organizationType: 'subordinate_unit',
      },
    ]);
    expect(response.body.callsByStatus).toEqual([
      { status: 'Aberto', label: 'Aberto', count: 1 },
      { status: 'Em atendimento', label: 'Em atendimento', count: 1 },
      { status: 'Resolvido', label: 'Resolvido', count: 1 },
    ]);
    expect(response.body.criticalCalls).toBe(1);
    expect(response.body.pendingMovements).toBe(1);
    expect(response.body.monitoredUnits).toBe(2);
    expect(response.body.recentActivity).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        description: 'Chamado Resolvido: ATIVUS-2026-0003',
        occurredAt: expect.any(String),
      }),
      expect.objectContaining({
        id: expect.any(String),
        description: 'Chamado Em atendimento: ATIVUS-2026-0002',
        occurredAt: expect.any(String),
      }),
      expect.objectContaining({
        id: expect.any(String),
        description: 'Chamado Aberto: ATIVUS-2026-0001',
        occurredAt: expect.any(String),
      }),
    ]);
    expect(response.body.recentMovements).toHaveLength(1);
    expect(response.body.recentMovements[0]).toMatchObject({
      equipmentId: 'PAT-004',
      status: 'Pendente',
      origin: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
      destination: { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' },
    });
    expect(response.body.recentMovements[0].id).toEqual(expect.any(String));
    expect(response.body.recentMovements[0].occurredAt).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('scopes call indicators, pending movements and unit summaries for a unit user', async () => {
    await seedEquipment();
    const agent = await loginAsUnitUser();

    const response = await agent.get('/api/v1/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.unitSummaries).toEqual([
      {
        unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
        coverage: '100%',
        equipmentShare: '100%',
        patrimonialCoverage: null,
        equipment: 2,
        attention: 0,
        organizationType: 'subordinate_unit',
      },
    ]);
    expect(response.body.callsByStatus).toEqual([
      { status: 'Aberto', label: 'Aberto', count: 1 },
      { status: 'Resolvido', label: 'Resolvido', count: 1 },
    ]);
    expect(response.body.criticalCalls).toBe(1);
    expect(response.body.pendingMovements).toBe(1);
    expect(response.body.monitoredUnits).toBe(1);
    expect(response.body.recentActivity).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        description: 'Chamado Resolvido: ATIVUS-2026-0003',
        occurredAt: expect.any(String),
      }),
      expect.objectContaining({
        id: expect.any(String),
        description: 'Chamado Aberto: ATIVUS-2026-0001',
        occurredAt: expect.any(String),
      }),
    ]);
    expect(response.body.recentMovements).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('applies combined organization, section, situation and period filters to all dashboard projections', async () => {
    await seedEquipment();
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/dashboard').query({
      municipality: 'Belém',
      region: 'Metropolitana',
      section: 'Telecom',
      situation: 'active',
      period: '2026-08',
    });

    expect(response.status).toBe(200);
    expect(response.body.metrics).toEqual({ total: 1, active: 1, maintenance: 0, attention: 0 });
    expect(response.body.unitSummaries).toEqual([
      expect.objectContaining({
        unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' },
        equipment: 1,
        equipmentShare: '100%',
        patrimonialCoverage: null,
        organizationType: 'subordinate_unit',
      }),
    ]);
    expect(response.body.callsByStatus).toEqual([]);
    expect(response.body.criticalCalls).toBe(0);
    expect(response.body.pendingMovements).toBe(0);
    expect(response.body.monitoredUnits).toBe(1);
  });

  it('aggregates a command across multi-level descendants and rejects a unit outside it', async () => {
    await seedHierarchicalEquipment();
    const agent = await loginAsDitelAdmin();

    const command = await agent.get('/api/v1/dashboard').query({ commandId: 'command-north' });
    expect(command.status).toBe(200);
    expect(command.body.metrics).toEqual({ total: 2, active: 1, maintenance: 1, attention: 0 });
    expect(command.body.unitSummaries.map((item: { unit: { id: string } }) => item.unit.id)).toEqual(['unit-north-a', 'unit-north-b', 'command-north', 'region-north']);

    const outside = await agent.get('/api/v1/dashboard').query({ commandId: 'command-north', unitId: 'unit-south' });
    expect(outside.status).toBe(400);
    expect(outside.body.code).toBe('INVALID_QUERY');
  });

  it('returns real command options with subordinate units and empty command state', async () => {
    await seedHierarchicalEquipment();
    const agent = await loginAsDitelAdmin();

    const response = await agent.get('/api/v1/organizational-options');

    expect(response.status).toBe(200);
    expect(response.body.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'command-north', name: 'CPRM', units: expect.arrayContaining([expect.objectContaining({ id: 'unit-north-a' }), expect.objectContaining({ id: 'unit-north-b' })]) }),
      expect.objectContaining({ id: 'command-south', name: 'CPS', units: [expect.objectContaining({ id: 'unit-south' })] }),
    ]));
  });
});
