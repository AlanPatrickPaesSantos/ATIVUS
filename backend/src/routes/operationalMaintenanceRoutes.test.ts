import express, { type RequestHandler } from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createErrorHandler } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { OperationalMaintenanceWindowModel } from '../models/OperationalMaintenanceWindow.js';
import { recordAuditEvent } from '../repositories/auditRepository.js';
import { createMovementRoutes } from './movementRoutes.js';
import { createOperationalMaintenanceRoutes } from './operationalMaintenanceRoutes.js';

vi.mock('../repositories/auditRepository.js', () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

function sessionMiddleware(): RequestHandler {
  return (req, _res, next) => {
    const role = req.get('x-test-role') === 'ditel_admin' ? 'ditel_admin' : 'unit_user';
    req.sessionContext = { userId: 'test-user', name: 'Teste', registration: 'T-1', role, unit: null };
    next();
  };
}

describe('operational maintenance routes', () => {
  let mongo: MongoMemoryReplSet;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongo.getUri());
  });

  afterEach(async () => {
    await OperationalMaintenanceWindowModel.deleteMany({});
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongo.stop();
  });

  it('restricts activation and deactivation to ditel_admin', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1', createOperationalMaintenanceRoutes(sessionMiddleware()));
    app.use(createErrorHandler({ error: vi.fn() }));

    expect((await request(app).patch('/api/v1/admin/operational-maintenance').set('x-test-role', 'unit_user').send({ active: true, reason: 'Índices' })).status).toBe(403);
    expect((await request(app).patch('/api/v1/admin/operational-maintenance').set('x-test-role', 'ditel_admin').send({ active: true, reason: 'Índices' })).status).toBe(200);
    expect((await request(app).patch('/api/v1/admin/operational-maintenance').set('x-test-role', 'ditel_admin').send({ active: false, reason: 'Concluído' })).status).toBe(200);
  });

  it('blocks existing Movement mutations while preserving health and GET routing', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/v1/health', (_req, res) => res.status(200).json({ status: 'ok' }));
    const requireSession = sessionMiddleware();
    app.use('/api/v1', createOperationalMaintenanceRoutes(requireSession));
    app.use('/api/v1', createMovementRoutes(requireSession));
    app.use(createErrorHandler({ error: vi.fn() }));

    await request(app).patch('/api/v1/admin/operational-maintenance').set('x-test-role', 'ditel_admin').send({ active: true, reason: 'Índices' });

    expect((await request(app).post('/api/v1/movements').set('x-test-role', 'unit_user').send({})).status).toBe(503);
    expect((await request(app).patch('/api/v1/movements/any/decision').set('x-test-role', 'ditel_admin').send({})).status).toBe(503);
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });

  it('rolls back activation when the audit write fails', async () => {
    vi.mocked(recordAuditEvent).mockRejectedValueOnce(new Error('audit unavailable'));
    const app = express();
    app.use(express.json());
    app.use('/api/v1', createOperationalMaintenanceRoutes(sessionMiddleware()));
    app.use(createErrorHandler({ error: vi.fn() }));

    expect((await request(app).patch('/api/v1/admin/operational-maintenance').set('x-test-role', 'ditel_admin').send({ active: true, reason: 'Índices' })).status).toBe(500);
    expect((await request(app).get('/api/v1/admin/operational-maintenance').set('x-test-role', 'ditel_admin')).body.active).toBe(false);
  });
});
