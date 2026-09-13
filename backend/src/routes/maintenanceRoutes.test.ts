import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { MaintenanceModel } from '../models/Maintenance.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

const unit1 = { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' };
const unit2 = { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' };

function sessionServiceFor(context: SessionContext): SessionService {
  return {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
}

function maintenanceRequest(context: SessionContext) {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .get('/api/v1/maintenance')
    .set('Cookie', 'sigat_session=test');
}

function createMaintenanceRequest(context: SessionContext, payload: Record<string, unknown>) {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .post('/api/v1/maintenance')
    .set('Cookie', 'sigat_session=test')
    .send(payload);
}

async function seedMaintenance() {
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is not available');

  await UnitModel.create([
    { ...unit1, active: true },
    { ...unit2, active: true },
  ]);

  const [radio, notebook, printer] = await EquipmentModel.create([
    { patrimony: 'PAT-MNT-001', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', situation: 'maintenance', location: 'Bancada', unit: unit1 },
    { patrimony: 'PAT-MNT-002', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'maintenance', location: 'Suporte', unit: unit1 },
    { patrimony: 'PAT-MNT-003', type: 'Impressora', model: 'LaserJet', brand: 'HP', situation: 'maintenance', location: 'Oficina', unit: unit2 },
  ]);

  await database.collection('maintenances').insertMany([
    {
      equipmentId: radio.id,
      equipment: { id: radio.id, patrimony: 'PAT-MNT-001', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' },
      unit: unit1,
      status: 'open',
      description: 'Rádio sem transmissão.',
      openedAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
      storageKey: 'private/maintenance/radio.pdf',
      tokenDigest: 'digest-nao-deve-sair',
    },
    {
      equipmentId: notebook.id,
      equipment: { id: notebook.id, patrimony: 'PAT-MNT-002', type: 'Notebook', model: 'Latitude', brand: 'Dell' },
      unit: unit1,
      status: 'completed',
      description: 'Troca de SSD concluída.',
      openedAt: new Date('2026-09-02T10:00:00.000Z'),
      updatedAt: new Date('2026-09-03T12:00:00.000Z'),
      passwordHash: 'hash-nao-deve-sair',
    },
    {
      equipmentId: printer.id,
      equipment: { id: printer.id, patrimony: 'PAT-MNT-003', type: 'Impressora', model: 'LaserJet', brand: 'HP' },
      unit: unit2,
      status: 'open',
      description: 'Atolamento recorrente.',
      openedAt: new Date('2026-09-04T10:00:00.000Z'),
      updatedAt: new Date('2026-09-04T12:00:00.000Z'),
      sessionId: 'sessao-nao-deve-sair',
    },
  ]);

  return { radio, notebook, printer };
}

describe('maintenance routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([CallModel.init(), EquipmentModel.init(), MaintenanceModel.init(), UserModel.init(), SessionModel.init(), AuditEventModel.init(), UnitModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('requires an authenticated session', async () => {
    const response = await request(createApp()).get('/api/v1/maintenance');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
  });

  it('allows DITEL to list statewide maintenance records without sensitive fields', async () => {
    await seedMaintenance();

    const response = await maintenanceRequest({ userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null });

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({ equipment: expect.objectContaining({ patrimony: 'PAT-MNT-003', type: 'Impressora' }), unit: unit2, status: 'open' }),
      expect.objectContaining({ equipment: expect.objectContaining({ patrimony: 'PAT-MNT-002', type: 'Notebook' }), unit: unit1, status: 'completed' }),
      expect.objectContaining({ equipment: expect.objectContaining({ patrimony: 'PAT-MNT-001', type: 'Rádio portátil' }), unit: unit1, status: 'open' }),
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);
  });

  it('limits a unit user to maintenance records from their authenticated unit', async () => {
    await seedMaintenance();

    const response = await maintenanceRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((item: { unit: { id: string } }) => item.unit.id)).toEqual(['unit-1', 'unit-1']);
    expect(JSON.stringify(response.body)).not.toContain('PAT-MNT-003');
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);
  });

  it('filters maintenance records by status and equipment type', async () => {
    await seedMaintenance();

    const response = await maintenanceRequest({ userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null })
      .query({ status: 'open', equipmentType: 'Rádio portátil' });

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        equipment: expect.objectContaining({ patrimony: 'PAT-MNT-001', type: 'Rádio portátil' }),
        status: 'open',
      }),
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);
  });

  it('allows a unit user to open maintenance for own active or maintenance equipment and audits without secrets', async () => {
    await UnitModel.create([{ ...unit1, active: true }, { ...unit2, active: true }]);
    const [activeEquipment, maintenanceEquipment] = await EquipmentModel.create([
      { patrimony: 'PAT-OPEN-001', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', situation: 'active', location: 'Sala', unit: unit1 },
      { patrimony: 'PAT-OPEN-002', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'maintenance', location: 'Suporte', unit: unit1 },
    ]);
    const call = await CallModel.create({
      protocol: 'CH-2026-000099',
      problem: 'radio',
      priority: 'Alta',
      subject: 'Rádio falhando',
      description: 'Falha intermitente',
      section: 'Telecom',
      status: 'Aberto',
      unit: unit1,
      equipmentId: activeEquipment.id,
      createdBy: 'user-1',
    });
    const context = { userId: 'user-1', name: 'Ana', registration: '1', role: 'unit_user' as const, unit: unit1 };

    const linked = await createMaintenanceRequest(context, {
      equipmentId: activeEquipment.id,
      description: 'Encaminhar rádio para bancada.',
      status: 'open',
      type: 'corrective',
      callId: call.id,
    });
    const unlinked = await createMaintenanceRequest(context, {
      equipmentId: maintenanceEquipment.id,
      description: 'Continuar manutenção preventiva.',
      status: 'open',
      type: 'preventive',
    });

    expect(linked.status).toBe(201);
    expect(linked.body).toMatchObject({
      equipment: { id: activeEquipment.id, patrimony: 'PAT-OPEN-001', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' },
      unit: unit1,
      status: 'open',
      type: 'corrective',
      description: 'Encaminhar rádio para bancada.',
      call: { id: call.id, protocol: 'CH-2026-000099', subject: 'Rádio falhando' },
    });
    expect(unlinked.status).toBe(201);
    expect(unlinked.body).toMatchObject({
      equipment: { id: maintenanceEquipment.id, patrimony: 'PAT-OPEN-002' },
      status: 'open',
    });
    expect(unlinked.body).not.toHaveProperty('call');
    expect(JSON.stringify([linked.body, unlinked.body])).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);
    const audit = await AuditEventModel.findOne({ action: 'maintenance.create', result: 'success', userId: 'user-1', 'after.callId': call.id }).lean();
    expect(audit).toMatchObject({
      action: 'maintenance.create',
      module: 'maintenance',
      userId: 'user-1',
      entity: { type: 'maintenance', label: 'PAT-OPEN-001' },
      unit: unit1,
      result: 'success',
      after: { status: 'open', equipmentId: activeEquipment.id, callId: call.id },
    });
    expect(JSON.stringify(audit)).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);
  });

  it('forbids DITEL from creating maintenance in this stage', async () => {
    await UnitModel.create({ ...unit1, active: true });
    const equipment = await EquipmentModel.create({ patrimony: 'PAT-DITEL-001', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', situation: 'active', location: 'Sala', unit: unit1 });

    const response = await createMaintenanceRequest({ userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null }, {
      equipmentId: equipment.id,
      description: 'DITEL não abre nesta etapa.',
      status: 'open',
      type: 'corrective',
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'FORBIDDEN', message: 'Apenas usuários de unidade podem abrir manutenções.' });
  });

  it('returns 404 when a unit user tries to open maintenance for equipment outside their unit', async () => {
    await UnitModel.create([{ ...unit1, active: true }, { ...unit2, active: true }]);
    const equipment = await EquipmentModel.create({ patrimony: 'PAT-OTHER-001', type: 'Impressora', model: 'LaserJet', brand: 'HP', situation: 'active', location: 'Oficina', unit: unit2 });

    const response = await createMaintenanceRequest({ userId: 'u', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 }, {
      equipmentId: equipment.id,
      description: 'Tentar abrir fora do escopo.',
      status: 'open',
      type: 'corrective',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Equipamento não encontrado.' });
  });

  it('validates required fields, status and allowed equipment situations before creating maintenance', async () => {
    await UnitModel.create({ ...unit1, active: true });
    const activeEquipment = await EquipmentModel.create({ patrimony: 'PAT-ACTIVE-001', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'active', location: 'Sala', unit: unit1 });
    const inactiveEquipment = await EquipmentModel.create({ patrimony: 'PAT-INACTIVE-001', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'inactive', location: 'Arquivo', unit: unit1 });
    const context = { userId: 'u', name: 'Ana', registration: '1', role: 'unit_user' as const, unit: unit1 };

    const missingDescription = await createMaintenanceRequest(context, { equipmentId: activeEquipment.id, status: 'open', type: 'corrective' });
    const missingType = await createMaintenanceRequest(context, { equipmentId: activeEquipment.id, description: 'Descrição válida.', status: 'open' });
    const invalidStatus = await createMaintenanceRequest(context, { equipmentId: activeEquipment.id, description: 'Descrição válida.', status: 'done', type: 'corrective' });
    const invalidSituation = await createMaintenanceRequest(context, { equipmentId: inactiveEquipment.id, description: 'Descrição válida.', status: 'open', type: 'corrective' });
    const unsafePayload = await createMaintenanceRequest(context, { equipmentId: activeEquipment.id, description: 'Descrição válida.', status: 'open', type: 'corrective', passwordHash: 'hash' });

    expect(missingDescription.status).toBe(400);
    expect(missingDescription.body).toEqual({ code: 'INVALID_MAINTENANCE', message: 'Dados de manutenção inválidos.' });
    expect(missingType.status).toBe(400);
    expect(missingType.body).toEqual({ code: 'INVALID_MAINTENANCE', message: 'Dados de manutenção inválidos.' });
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body).toEqual({ code: 'INVALID_MAINTENANCE', message: 'Dados de manutenção inválidos.' });
    expect(invalidSituation.status).toBe(409);
    expect(invalidSituation.body).toEqual({ code: 'INVALID_EQUIPMENT_SITUATION', message: 'A manutenção só pode ser aberta para equipamento ativo ou em manutenção.' });
    expect(unsafePayload.status).toBe(400);
    expect(unsafePayload.body).toEqual({ code: 'INVALID_MAINTENANCE', message: 'Dados de manutenção inválidos.' });
    expect(await AuditEventModel.countDocuments({ action: 'maintenance.create' })).toBe(0);
  });

  it('allows DITEL to update maintenance progress with concurrency and audit', async () => {
    await seedMaintenance();
    const maintenance = await MaintenanceModel.findOne({ status: 'open' }).orFail();
    const context: SessionContext = { userId: 'ditel-1', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null };
    const response = await request(createApp({ sessionService: sessionServiceFor(context) }))
      .patch(`/api/v1/maintenance/${maintenance.id}`)
      .set('Cookie', 'sigat_session=test')
      .send({ status: 'completed', service: 'Substituição do módulo', diagnosis: 'Falha no módulo de transmissão', technicalResponsible: 'Equipe DITEL', completedAt: '2026-09-10T12:00:00.000Z', updatedAt: maintenance.updatedAt.toISOString() });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: maintenance.id, status: 'completed', service: 'Substituição do módulo' });
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);
    const audit = await AuditEventModel.findOne({ action: 'maintenance.update', result: 'success' }).lean();
    expect(audit).toMatchObject({
      module: 'maintenance', userId: 'ditel-1',
      before: { status: 'open', diagnosis: null, service: null, technicalResponsible: null, completedAt: null },
      after: { status: 'completed', diagnosis: 'Falha no módulo de transmissão', service: 'Substituição do módulo', technicalResponsible: 'Equipe DITEL' },
    });
    expect(JSON.stringify(audit)).not.toMatch(/storageKey|passwordHash|password|senha|token|tokenDigest|sessionId/i);
  });

  it('rejects unit updates and stale maintenance updates', async () => {
    await seedMaintenance();
    const maintenance = await MaintenanceModel.findOne({ status: 'open' }).orFail();
    const unitContext: SessionContext = { userId: 'unit-1', name: 'Ana', registration: '1', role: 'unit_user', unit: unit1 };
    const unitResponse = await request(createApp({ sessionService: sessionServiceFor(unitContext) })).patch(`/api/v1/maintenance/${maintenance.id}`).set('Cookie', 'sigat_session=test').send({ status: 'completed', updatedAt: maintenance.updatedAt.toISOString() });
    const ditelContext: SessionContext = { userId: 'ditel-1', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null };
    const staleResponse = await request(createApp({ sessionService: sessionServiceFor(ditelContext) })).patch(`/api/v1/maintenance/${maintenance.id}`).set('Cookie', 'sigat_session=test').send({ status: 'completed', updatedAt: '2026-01-01T00:00:00.000Z' });

    expect(unitResponse.status).toBe(403);
    expect(unitResponse.body.code).toBe('FORBIDDEN');
    expect(staleResponse.status).toBe(409);
    expect(staleResponse.body.code).toBe('MAINTENANCE_CONFLICT');
    // Rollback de auditoria: nenhuma escrita falha pode deixar evento de sucesso para trás.
    expect(await AuditEventModel.countDocuments({ action: 'maintenance.update', result: 'success' })).toBe(0);
  });

  it('rejects extra fields and invalid concurrency data', async () => {
    await seedMaintenance();
    const maintenance = await MaintenanceModel.findOne({ status: 'open' }).orFail();
    const context: SessionContext = { userId: 'ditel-1', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null };
    const extra = await request(createApp({ sessionService: sessionServiceFor(context) })).patch(`/api/v1/maintenance/${maintenance.id}`).set('Cookie', 'sigat_session=test').send({ status: 'completed', updatedAt: maintenance.updatedAt.toISOString(), passwordHash: 'forbidden' });
    const invalidDate = await request(createApp({ sessionService: sessionServiceFor(context) })).patch(`/api/v1/maintenance/${maintenance.id}`).set('Cookie', 'sigat_session=test').send({ status: 'completed', updatedAt: 'invalid' });
    const invalidCompletion = await request(createApp({ sessionService: sessionServiceFor(context) })).patch(`/api/v1/maintenance/${maintenance.id}`).set('Cookie', 'sigat_session=test').send({ status: 'completed', completedAt: 'invalid', updatedAt: maintenance.updatedAt.toISOString() });

    expect(extra.status).toBe(400);
    expect(extra.body.code).toBe('INVALID_MAINTENANCE');
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.body.code).toBe('INVALID_MAINTENANCE');
    expect(invalidCompletion.status).toBe(400);
    expect(invalidCompletion.body.code).toBe('INVALID_MAINTENANCE');
  });
});
