import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { EquipmentModel } from '../models/Equipment.js';
import { MovementModel } from '../models/Movement.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

const u1 = { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' };
const u2 = { id: 'unit-2', name: 'Unidade 2', acronym: 'U2' };
const u3 = { id: 'unit-3', name: 'Unidade 3', acronym: 'U3' };
const cookie = 'sigat_session=x';

function app(context: SessionContext) {
  const service: SessionService = {
    async login() { throw new Error('unused'); },
    async getSessionContext() { return context; },
    async logout() {},
    async recordMissingSessionCookie() {},
  };
  return createApp({ sessionService: service });
}

async function seedMovements() {
  await UnitModel.create([{ ...u1, active: true }, { ...u2, active: true }, { ...u3, active: true }]);
  const equipment = await EquipmentModel.create([
    { patrimony: 'PAT-001', type: 'Rádio', model: 'A', brand: 'B', situation: 'active', location: 'Sala', unit: u1 },
    { patrimony: 'PAT-002', type: 'Rádio', model: 'B', brand: 'B', situation: 'active', location: 'Sala', unit: u1 },
    { patrimony: 'PAT-003', type: 'Rádio', model: 'C', brand: 'B', situation: 'active', location: 'Sala', unit: u2 },
    { patrimony: 'PAT-004', type: 'Rádio', model: 'D', brand: 'B', situation: 'active', location: 'Sala', unit: u3 },
  ]);
  await MovementModel.create([
    { _id: '507f1f77bcf86cd799439011', type: 'Transferência definitiva', equipmentId: String(equipment[0]._id), origin: u1, destination: u2, requestedBy: 'user-1', status: 'Pendente', createdAt: new Date('2026-10-01T10:00:00.000Z'), updatedAt: new Date('2026-10-01T10:00:00.000Z') },
    { _id: '507f1f77bcf86cd799439012', type: 'Transferência definitiva', equipmentId: String(equipment[1]._id), origin: u1, destination: u3, requestedBy: 'user-1', status: 'Recebida', createdAt: new Date('2026-10-02T10:00:00.000Z'), updatedAt: new Date('2026-10-02T10:00:00.000Z') },
    { _id: '507f1f77bcf86cd799439013', type: 'Transferência definitiva', equipmentId: String(equipment[2]._id), origin: u2, destination: u3, requestedBy: 'user-2', status: 'Pendente', createdAt: new Date('2026-10-03T10:00:00.000Z'), updatedAt: new Date('2026-10-03T10:00:00.000Z') },
    { _id: '507f1f77bcf86cd799439014', type: 'Transferência definitiva', equipmentId: String(equipment[3]._id), origin: u3, destination: u1, requestedBy: 'user-3', status: 'Cancelada', createdAt: new Date('2026-10-04T10:00:00.000Z'), updatedAt: new Date('2026-10-04T10:00:00.000Z') },
  ]);
}

describe('movement pagination', () => {
  let server: MongoMemoryReplSet;

  beforeAll(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(server.getUri());
    await Promise.all([EquipmentModel.init(), MovementModel.init(), SessionModel.init(), UnitModel.init(), UserModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await server.stop();
  });

  it('returns a deterministic paginated page with total metadata', async () => {
    await seedMovements();
    const response = await request(app({ userId: 'ditel', name: 'DITEL', registration: '1', role: 'ditel_admin', unit: null }))
      .get('/api/v1/movements?page=2&pageSize=2')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 4, page: 2, pageSize: 2, totalPages: 2 });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439011']);
  });

  it('applies combined filters and unit scope before counting', async () => {
    await seedMovements();
    const response = await request(app({ userId: 'unit', name: 'Unidade 1', registration: '2', role: 'unit_user', unit: u1 }))
      .get('/api/v1/movements?status=Pendente&unitId=unit-2&search=PAT-001&from=2026-10-01&to=2026-10-01')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(response.body.items[0]).toMatchObject({ id: '507f1f77bcf86cd799439011', status: 'Pendente' });
  });

  it('returns an empty page when the requested page is beyond the result set', async () => {
    await seedMovements();
    const response = await request(app({ userId: 'ditel', name: 'DITEL', registration: '1', role: 'ditel_admin', unit: null }))
      .get('/api/v1/movements?page=99&pageSize=2')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 4, page: 99, pageSize: 2, totalPages: 2, items: [] });
  });

  it('rejects invalid pagination and filter parameters', async () => {
    const response = await request(app({ userId: 'ditel', name: 'DITEL', registration: '1', role: 'ditel_admin', unit: null }))
      .get('/api/v1/movements?page=0&pageSize=101&from=not-a-date&status=alocacao')
      .set('Cookie', cookie);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_QUERY');
  });
});
