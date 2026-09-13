import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { UnitModel } from '../models/Unit.js';

const service = (context: SessionContext): SessionService => ({
  async login() { throw new Error('unused'); },
  async getSessionContext() { return context; },
  async logout() {},
  async recordMissingSessionCookie() {},
});
const get = (context: SessionContext) => request(createApp({ sessionService: service(context) }))
  .get('/api/v1/units').set('Cookie', 'sigat_session=test');

describe('unit routes', () => {
  let server: MongoMemoryServer;
  beforeAll(async () => { server = await MongoMemoryServer.create(); await connectToDatabase(server.getUri()); await UnitModel.init(); });
  afterEach(async () => { await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))); });
  afterAll(async () => { await disconnectFromDatabase(); await server.stop(); });

  it('requires a session', async () => { expect((await request(createApp()).get('/api/v1/units')).status).toBe(401); });
  it('returns only active destinations and excludes the unit user own unit', async () => {
    await UnitModel.create([
      { id: 'unit-1', name: 'Origem', acronym: 'ORI', active: true },
      { id: 'unit-2', name: 'Destino', acronym: 'DST', active: true },
      { id: 'unit-3', name: 'Inativa', acronym: 'INA', active: false },
    ]);
    const response = await get({ userId: 'u1', name: 'Ana', registration: '1', role: 'unit_user', unit: { id: 'unit-1', name: 'Origem', acronym: 'ORI' } });
    expect(response.status).toBe(200); expect(response.body).toEqual({ items: [{ id: 'unit-2', name: 'Destino', acronym: 'DST' }] });
  });
  it('returns all active units to DITEL without sensitive fields', async () => {
    await UnitModel.create([{ id: 'unit-1', name: 'Origem', acronym: 'ORI', active: true }, { id: 'unit-2', name: 'Destino', acronym: 'DST', active: false }]);
    const response = await get({ userId: 'admin', name: 'Carlos', registration: '2', role: 'ditel_admin', unit: null });
    expect(response.status).toBe(200); expect(response.body).toEqual({ items: [{ id: 'unit-1', name: 'Origem', acronym: 'ORI' }] });
  });
  it('rejects a unit user without a valid unit scope', async () => {
    const response = await get({ userId: 'u1', name: 'Ana', registration: '1', role: 'unit_user', unit: null });
    expect(response.status).toBe(403);
  });
  it('rejects a unit user linked to an inactive unit', async () => {
    await UnitModel.create({ id: 'unit-1', name: 'Origem', acronym: 'ORI', active: false });
    const response = await get({ userId: 'u1', name: 'Ana', registration: '1', role: 'unit_user', unit: { id: 'unit-1', name: 'Origem', acronym: 'ORI' } });
    expect(response.status).toBe(403);
  });
  it('rejects a unit user linked to a missing unit', async () => {
    const response = await get({ userId: 'u1', name: 'Ana', registration: '1', role: 'unit_user', unit: { id: 'unit-404', name: 'Fantasma', acronym: 'FTM' } });
    expect(response.status).toBe(403);
  });
});
