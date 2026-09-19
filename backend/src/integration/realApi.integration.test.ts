import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { UserModel } from '../models/User.js';
import { UnitModel } from '../models/Unit.js';
import { EquipmentModel } from '../models/Equipment.js';
import { CallModel } from '../models/Call.js';
import { MovementModel } from '../models/Movement.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { LoginRateLimitCounterModel } from '../models/LoginRateLimitCounter.js';

describe('real API integration', () => {
  let replSet: MongoMemoryReplSet;
  let app: ReturnType<typeof createApp>;
  let equipmentId: string;
  let movementId: string;
  const unit = { id: 'int-unit-origin', name: 'Unidade Integração', acronym: 'UI' };
  const destination = { id: 'int-unit-destination', name: 'Destino Integração', acronym: 'DI' };

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(replSet.getUri());
    await LoginRateLimitCounterModel.init();
    app = createApp({ sessionCookieSecure: false });
  });

  beforeEach(async () => {
    await Promise.all([
      UserModel.deleteMany({}), UnitModel.deleteMany({}), EquipmentModel.deleteMany({}),
      CallModel.deleteMany({}), MovementModel.deleteMany({}), AuditEventModel.deleteMany({}),
      LoginRateLimitCounterModel.deleteMany({}),
    ]);
    await UnitModel.create([
      { ...unit, active: true },
      { ...destination, active: true },
    ]);
    const user = new UserModel({ name: 'Usuário Integração', registration: 'int-user', role: 'unit_user', unit });
    user.set('password', 'senha-de-teste-nao-sensivel');
    await user.save();
    const admin = new UserModel({ name: 'Admin Integração', registration: 'int-admin', role: 'ditel_admin', unit: null });
    admin.set('password', 'senha-de-teste-nao-sensivel');
    await admin.save();
    const equipment = await EquipmentModel.create({ patrimony: `INT-${Date.now()}`, type: 'Notebook', model: 'Teste', brand: 'SIGAT', situation: 'active', location: 'Sala de teste', unit, createdBy: user.id, history: [{ id: 'initial', description: 'Cadastro inicial', occurredAt: new Date() }] });
    equipmentId = equipment.id;
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await replSet.stop();
  });

  it('executes login, session, inventory, calls and units against MongoDB', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/login').send({ registration: 'int-user', password: 'senha-de-teste-nao-sensivel' });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('unit_user');
    expect(login.body).not.toHaveProperty('passwordHash');

    expect((await agent.get('/api/v1/session')).status).toBe(200);
    const dashboard = await agent.get('/api/v1/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body).toMatchObject({
      unit,
      metrics: { total: 1, active: 1, maintenance: 0, attention: 0 },
      situations: [
        { situation: 'active', label: 'Em operação', count: 1 },
        { situation: 'maintenance', label: 'Em manutenção', count: 0 },
        { situation: 'inactive', label: 'Inativos', count: 0 },
        { situation: 'attention', label: 'Requer atenção', count: 0 },
      ],
      recentActivity: [],
    });
    const inventory = await agent.get('/api/v1/inventory?page=1&pageSize=10');
    expect(inventory.status).toBe(200);
    expect(inventory.body.items).toHaveLength(1);
    expect(inventory.body.items[0].id).toBe(equipmentId);
    expect((await agent.get('/api/v1/units')).body.items).toEqual([{ ...destination }]);

    const call = await agent.post('/api/v1/calls').field({ problem: 'hardware', priority: 'medium', subject: 'Falha de teste', description: 'Descrição sintética', equipmentId });
    expect(call.status).toBe(201);
    expect(call.body).toMatchObject({ id: expect.any(String), protocol: expect.stringMatching(/^CH-\d{4}-\d{6}$/) });
    expect((await agent.get('/api/v1/calls')).body.items[0].subject).toBe('Falha de teste');
  });

  it('creates and approves a movement through real sessions and transaction', async () => {
    const unitAgent = request.agent(app);
    await unitAgent.post('/api/v1/auth/login').send({ registration: 'int-user', password: 'senha-de-teste-nao-sensivel' });
    const created = await unitAgent.post('/api/v1/movements').send({ equipmentId, destination });
    expect(created.status).toBe(201);
    movementId = created.body.id;

    const adminAgent = request.agent(app);
    await adminAgent.post('/api/v1/auth/login').send({ registration: 'int-admin', password: 'senha-de-teste-nao-sensivel' });
    const listed = await adminAgent.get('/api/v1/movements');
    expect(listed.body.items).toHaveLength(1);
    const decided = await adminAgent.patch(`/api/v1/movements/${movementId}/decision`).send({ status: 'Aprovada', updatedAt: listed.body.items[0].updatedAt });
    expect(decided.status).toBe(200);
    const persisted = await EquipmentModel.findById(equipmentId).lean();
    expect(persisted?.unit?.id).toBe(destination.id);
    expect((await adminAgent.get('/api/v1/movements')).body.items[0].status).toBe('Aprovada');
  });
});
