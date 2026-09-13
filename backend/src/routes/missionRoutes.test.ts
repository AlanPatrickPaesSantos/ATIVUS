import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';

import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { MissionModel } from '../models/Mission.js';
import { createMissionRecord } from '../repositories/missionRepository.js';
import type { SessionContext } from '../auth/sessionService.js';
import type { SessionService } from '../auth/sessionService.js';

function sessionServiceFor(context: SessionContext): SessionService {
  return {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
}

async function waitForPrimary() {
  const maxAttempts = 20;
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const admin = mongoose.connection.db!.admin();
      const status = await admin.command({ replSetGetStatus: 1 });
      if ((status as { myState?: number }).myState === 1) return;
      lastError = new Error(`primary not ready (state=${(status as { myState?: number }).myState})`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError;
}

const unit1 = { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' };
const ditelContext: SessionContext = { userId: 'ditel-1', name: 'DITEL Admin', registration: '200001', role: 'ditel_admin', unit: null };
const unitContext: SessionContext = { userId: 'unit-1', name: 'Ana Souza', registration: '100001', role: 'unit_user', unit: unit1 };

describe('mission routes', () => {
  let mongoServer: MongoMemoryReplSet;
  let app: express.Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await waitForPrimary();
    app = createApp({ sessionService: sessionServiceFor(ditelContext) });
  });

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const name of Object.keys(collections)) {
      await collections[name].deleteMany({});
    }
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('creates a mission and records audit', async () => {
    const res = await request(app)
      .post('/api/v1/missions')
      .set('Cookie', 'sigat_session=test')
      .send({ title: 'Instalar rádio', description: 'Instalar equipamento na sala de comunicações', unit: unit1 });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Instalar rádio');
    expect(res.body.status).toBe('assigned');
    expect(res.body.unit.id).toBe('unit-centro');

    const audit = await AuditEventModel.findOne({ action: 'mission.create', result: 'success' }).lean();
    expect(audit).toMatchObject({
      module: 'mission',
      userId: 'ditel-1',
      before: null,
      after: { title: 'Instalar rádio', status: 'assigned' },
    });
  });

  it('lists missions for DITEL (all) and unit (scoped)', async () => {
    await createMissionRecord({
      title: 'Missão A', description: 'Visita técnica', unit: unit1,
      assignedBy: { id: 'ditel-1', name: 'DITEL Admin', registration: '200001' },
      assignedTo: { id: 'unit-centro', name: '3º BPM', registration: '100001' },
    });

    const ditelRes = await request(app).get('/api/v1/missions').set('Cookie', 'sigat_session=test');
    expect(ditelRes.status).toBe(200);
    expect(ditelRes.body.items).toHaveLength(1);

    const unitApp = createApp({ sessionService: sessionServiceFor(unitContext) });
    const unitRes = await request(unitApp).get('/api/v1/missions').set('Cookie', 'sigat_session=test');
    expect(unitRes.status).toBe(200);
    expect(unitRes.body.items).toHaveLength(1);
  });

  it('transitions mission through assigned → in_progress → completed', async () => {
    const created = await createMissionRecord({
      title: 'Manutenção preventiva', description: 'Revisão geral do equipamento', unit: unit1,
      assignedBy: { id: 'ditel-1', name: 'DITEL Admin', registration: '200001' },
      assignedTo: { id: 'unit-centro', name: '3º BPM', registration: '100001' },
    });
    const id = created._id.toString();

    const unitApp = createApp({ sessionService: sessionServiceFor(unitContext) });
    const startRes = await request(unitApp).patch(`/api/v1/missions/${id}`).set('Cookie', 'sigat_session=test').send({ status: 'in_progress' });
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe('in_progress');
    expect(startRes.body.startedAt).toBeTruthy();

    const completeRes = await request(unitApp).patch(`/api/v1/missions/${id}`).set('Cookie', 'sigat_session=test').send({ status: 'completed', note: 'Equipamento revisado' });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('completed');
    expect(completeRes.body.completedAt).toBeTruthy();

    const audit = await AuditEventModel.findOne({ action: 'mission.update', result: 'success' }).lean();
    expect(audit).toMatchObject({
      before: { status: 'in_progress' },
      after: { status: 'completed' },
    });
  });

  it('rejects invalid transition and non-authorized actions', async () => {
    const created = await createMissionRecord({
      title: 'Cancelar teste', description: 'Transição inválida', unit: unit1,
      assignedBy: { id: 'ditel-1', name: 'DITEL Admin', registration: '200001' },
      assignedTo: { id: 'unit-centro', name: '3º BPM', registration: '100001' },
    });
    const id = created._id.toString();

    // unit cannot start without being in_progress (can go to in_progress from assigned)
    // but unit cannot go from assigned → completed
    const unitApp = createApp({ sessionService: sessionServiceFor(unitContext) });
    const res1 = await request(unitApp).patch(`/api/v1/missions/${id}`).set('Cookie', 'sigat_session=test').send({ status: 'completed' });
    expect(res1.status).toBe(409);

    // DITEL cannot start (only unit can)
    const res2 = await request(app).patch(`/api/v1/missions/${id}`).set('Cookie', 'sigat_session=test').send({ status: 'in_progress' });
    expect(res2.status).toBe(403);

    // unit cannot cancel
    const res3 = await request(unitApp).patch(`/api/v1/missions/${id}`).set('Cookie', 'sigat_session=test').send({ status: 'cancelled' });
    expect(res3.status).toBe(403);

    // DITEL can cancel
    const res4 = await request(app).patch(`/api/v1/missions/${id}`).set('Cookie', 'sigat_session=test').send({ status: 'cancelled' });
    expect(res4.status).toBe(200);
    expect(res4.body.status).toBe('cancelled');
  });
});
