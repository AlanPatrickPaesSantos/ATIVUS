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
import { MovementModel } from '../models/Movement.js';
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

function reportsRequest(context: SessionContext) {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .get('/api/v1/reports/inventory-summary')
    .set('Cookie', 'sigat_session=test');
}

function exportRequest(context: SessionContext, format: string) {
  return request(createApp({ sessionService: sessionServiceFor(context) }))
    .get('/api/v1/reports/inventory-summary/export')
    .query({ format })
    .set('Cookie', 'sigat_session=test');
}

async function seed() {
  await UnitModel.create([
    { ...unit1, active: true },
    { ...unit2, active: true },
  ]);
  await EquipmentModel.create([
    { patrimony: 'PAT-001', type: 'Rádio', model: 'APX 2000', brand: 'Motorola', situation: 'active', location: 'Sala', unit: unit1, createdAt: new Date('2026-08-20') },
    { patrimony: 'PAT-002', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'maintenance', location: 'Suporte', unit: unit1, createdAt: new Date('2026-08-21') },
    { patrimony: 'PAT-003', type: 'Impressora', model: 'LaserJet', brand: 'HP', situation: 'inactive', location: 'Almoxarifado', unit: unit2, createdAt: new Date('2026-08-22') },
    { patrimony: 'PAT-004', type: 'Tablet', model: 'Tab Active', brand: 'Samsung', situation: 'lost', location: 'Reserva', unit: unit2, createdAt: new Date('2026-08-23') },
    { patrimony: 'PAT-005', type: 'Rádio', model: 'APX 8000', brand: 'Motorola', situation: 'written_off', location: 'Reserva', unit: unit2, createdAt: new Date('2026-08-24') },
  ]);
  await CallModel.create([
    { protocol: 'CALL-001', problem: 'radio', priority: 'Crítica', subject: 'Rádio sem transmissão', description: 'Falha total', section: 'Telecom', status: 'Aberto', unit: unit1, createdBy: 'u', createdAt: new Date('2026-08-25') },
    { protocol: 'CALL-002', problem: 'hardware', priority: 'Alta', subject: 'Notebook não liga', description: 'Sem energia', section: 'Suporte', status: 'Em atendimento', unit: unit1, createdBy: 'u', createdAt: new Date('2026-08-26') },
    { protocol: 'CALL-003', problem: 'printer', priority: 'Média', subject: 'Impressora com atolamento', description: 'Papel preso', section: 'Suporte', status: 'Resolvido', unit: unit2, createdBy: 'd', createdAt: new Date('2026-08-27') },
    { protocol: 'CALL-004', problem: 'software', priority: 'Baixa', subject: 'Atualização de sistema', description: 'Agendada', section: 'Suporte', status: 'Encerrado', unit: unit2, createdBy: 'd', createdAt: new Date('2026-08-28') },
  ]);
  await MovementModel.create([
    { type: 'Transferência definitiva', equipmentId: 'PAT-001', origin: unit1, destination: unit2, requestedBy: 'u', status: 'Pendente', createdAt: new Date('2026-08-25') },
    { type: 'Transferência definitiva', equipmentId: 'PAT-002', origin: unit1, destination: unit2, requestedBy: 'u', status: 'Aprovada', decidedBy: 'd', createdAt: new Date('2026-08-26') },
    { type: 'Transferência definitiva', equipmentId: 'PAT-003', origin: unit2, destination: unit1, requestedBy: 'd', status: 'Rejeitada', decidedBy: 'd', decisionReason: 'Sem justificativa', createdAt: new Date('2026-08-27') },
  ]);
}

const ditel = { userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin' as const, unit: null };
const unitAgent = { userId: 'u', name: 'Ana', registration: '1', role: 'unit_user' as const, unit: unit1 };

function serialized(body: unknown) {
  return JSON.stringify(body);
}

describe('report routes', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([EquipmentModel.init(), UserModel.init(), SessionModel.init(), AuditEventModel.init(), CallModel.init(), UnitModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('requires an authenticated session', async () => {
    const response = await request(createApp()).get('/api/v1/reports/inventory-summary');

    expect(response.status).toBe(401);
  });

  it('returns an inventory summary scoped to the authenticated unit and omits secrets', async () => {
    await seed();

    const response = await reportsRequest({
      userId: 'u',
      name: 'Ana',
      registration: '1',
      role: 'unit_user',
      unit: unit1,
    }).query({ unitId: unit2.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      report: {
        id: 'inventory-summary',
        title: 'Inventário consolidado',
        generatedAt: expect.any(String),
        scope: unit1,
        filters: { situation: null },
      },
      totals: {
        total: 2,
        active: 1,
        maintenance: 1,
        inactive: 0,
        lost: 0,
        writtenOff: 0,
        attention: 0,
      },
      units: [
        {
          unit: unit1,
          total: 2,
          active: 1,
          maintenance: 1,
          inactive: 0,
          lost: 0,
          writtenOff: 0,
          attention: 0,
        },
      ],
      generatedBy: { name: 'Ana', role: 'unit_user' },
    });
    expect(serialized(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('allows DITEL to request statewide or unit summaries from real inventory data', async () => {
    await seed();

    const statewide = await reportsRequest({
      userId: 'd',
      name: 'Carlos',
      registration: '2',
      role: 'ditel_admin',
      unit: null,
    });
    const unitOnly = await reportsRequest({
      userId: 'd',
      name: 'Carlos',
      registration: '2',
      role: 'ditel_admin',
      unit: null,
    }).query({ unitId: unit2.id });

    expect(statewide.status).toBe(200);
    expect(statewide.body.report.scope).toEqual({ id: 'statewide', name: 'Estado do Pará', acronym: 'DITEL' });
    expect(statewide.body.totals).toMatchObject({ total: 5, active: 1, maintenance: 1, inactive: 1, lost: 1, writtenOff: 1, attention: 3 });
    expect(statewide.body.units.map((item: { unit: { id: string } }) => item.unit.id)).toEqual(['unit-1', 'unit-2']);
    expect(unitOnly.body.report.scope).toEqual(unit2);
    expect(unitOnly.body.totals).toMatchObject({ total: 3, active: 0, maintenance: 0, inactive: 1, lost: 1, writtenOff: 1, attention: 3 });
  });

  it('exports the authenticated inventory summary as CSV without leaking secrets or other units', async () => {
    await seed();

    const response = await exportRequest({
      userId: 'u',
      name: 'Ana',
      registration: '1',
      role: 'unit_user',
      unit: unit1,
    }, 'csv').query({ unitId: unit2.id });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('inventory-summary.csv');
    expect(response.text).toContain('Unidade,Total,Em operação,Em manutenção,Inativos,Perdidos,Baixados,Atenção');
    expect(response.text).toContain('1ª Companhia,2,1,1,0,0,0,0');
    expect(response.text).not.toContain('2ª Companhia');
    expect(response.text).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('exports the authenticated inventory summary as a PDF document', async () => {
    await seed();

    const response = await exportRequest({
      userId: 'd',
      name: 'Carlos',
      registration: '2',
      role: 'ditel_admin',
      unit: null,
    }, 'pdf');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('inventory-summary.pdf');
    const pdf = response.body.toString('latin1');
    expect(pdf).toMatch(/^%PDF-/);
    expect(pdf).toContain('/F2 20 Tf');
    expect(pdf).toContain('/F3 8 Tf');
    expect(pdf).toContain('/Encoding /WinAnsiEncoding');
    expect(pdf).toContain('0.945 0.969 1 rg');
    expect(pdf).toContain('0.137 0.388 0.922 RG');
    expect(pdf).toContain('(Invent\\341rio consolidado)');
    expect(pdf).toContain('(EM OPERA\\307\\303O)');
    expect(pdf).toContain('(MANUTEN\\307\\303O)');
    expect(pdf).toContain('(Resumo executivo)');
    expect(pdf).not.toContain('<FEFF');
    expect(pdf).not.toContain('þÿ');
  });

  it('rejects unsupported export formats and invalid situation filters', async () => {
    await seed();

    const context: SessionContext = { userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null };

    expect((await exportRequest(context, 'xlsx')).status).toBe(400);
    expect((await reportsRequest(context).query({ situation: 'retired' })).status).toBe(400);
  });

  it('returns a calls report grouped by status and priority scoped to the unit', async () => {
    await seed();

    const response = await request(createApp({ sessionService: sessionServiceFor(unitAgent) }))
      .get('/api/v1/reports/calls-summary')
      .set('Cookie', 'sigat_session=test');

    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({
      id: 'calls-summary',
      title: 'Chamados por status e prioridade',
      scope: unit1,
    });
    expect(response.body.totals).toMatchObject({ total: 2, open: 1, critical: 1, attention: 2 });
    expect(response.body.byStatus).toEqual([
      { status: 'Aberto', count: 1 },
      { status: 'Em atendimento', count: 1 },
    ]);
    expect(response.body.byPriority).toEqual([
      { priority: 'Alta', count: 1 },
      { priority: 'Crítica', count: 1 },
    ]);
    expect(serialized(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('lets DITEL see statewide calls and requests a unit scope', async () => {
    await seed();

    const statewide = await request(createApp({ sessionService: sessionServiceFor(ditel) }))
      .get('/api/v1/reports/calls-summary')
      .set('Cookie', 'sigat_session=test');
    const unitOnly = await request(createApp({ sessionService: sessionServiceFor(ditel) }))
      .get('/api/v1/reports/calls-summary')
      .query({ unitId: unit2.id })
      .set('Cookie', 'sigat_session=test');

    expect(statewide.body.report.scope).toEqual({ id: 'statewide', name: 'Estado do Pará', acronym: 'DITEL' });
    expect(statewide.body.totals).toMatchObject({ total: 4, open: 1, critical: 1 });
    expect(unitOnly.body.report.scope).toEqual(unit2);
    expect(unitOnly.body.totals).toMatchObject({ total: 2, open: 0, critical: 0 });
  });

  it('returns a movements report scoped to the unit with status counts', async () => {
    await seed();

    const response = await request(createApp({ sessionService: sessionServiceFor(unitAgent) }))
      .get('/api/v1/reports/movements-summary')
      .set('Cookie', 'sigat_session=test');

    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({
      id: 'movements-summary',
      title: 'Movimentações por período',
      scope: unit1,
    });
    expect(response.body.totals).toMatchObject({ total: 3, pending: 1, approved: 1, rejected: 1 });
    expect(serialized(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('returns a consolidated DITEL report with inventory, calls and movements for admins', async () => {
    await seed();

    const response = await request(createApp({ sessionService: sessionServiceFor(ditel) }))
      .get('/api/v1/reports/general')
      .set('Cookie', 'sigat_session=test');

    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({
      id: 'general',
      title: 'Relatório geral DITEL',
      scope: { id: 'statewide', name: 'Estado do Pará', acronym: 'DITEL' },
    });
    expect(response.body.inventory.totals).toMatchObject({ total: 5, active: 1, maintenance: 1, attention: 3 });
    expect(response.body.calls.totals).toMatchObject({ total: 4, open: 1, critical: 1 });
    expect(response.body.movements.totals).toMatchObject({ total: 3, pending: 1, approved: 1, rejected: 1 });
    expect(serialized(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('keeps the general report scoped to the authenticated unit for unit users', async () => {
    await seed();

    const response = await request(createApp({ sessionService: sessionServiceFor(unitAgent) }))
      .get('/api/v1/reports/general')
      .set('Cookie', 'sigat_session=test');

    expect(response.status).toBe(200);
    expect(response.body.report.scope).toEqual(unit1);
    expect(response.body.inventory.totals).toMatchObject({ total: 2 });
    expect(response.body.calls.totals).toMatchObject({ total: 2 });
    expect(response.body.movements.totals).toMatchObject({ total: 3 });
    expect(serialized(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });
});
