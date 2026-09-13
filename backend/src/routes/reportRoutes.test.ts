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
}

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
    expect(response.body.toString('utf8')).toMatch(/^%PDF-/);
  });

  it('rejects unsupported export formats and invalid situation filters', async () => {
    await seed();

    const context: SessionContext = { userId: 'd', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null };

    expect((await exportRequest(context, 'xlsx')).status).toBe(400);
    expect((await reportsRequest(context).query({ situation: 'retired' })).status).toBe(400);
  });
});
