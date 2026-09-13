import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';
import { createCall } from '../repositories/callsRepository.js';

const unit1 = { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' };
const unit2 = { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' };
function service(context: SessionContext): SessionService { return { async login() { throw new Error('unused'); }, async getSessionContext() { return context; }, async logout() {}, async recordMissingSessionCookie() {} }; }
function appFor(context: SessionContext) { return createApp({ sessionService: service(context) }); }
const user = { userId: 'user-1', name: 'Ana', registration: '1', role: 'unit_user' as const, unit: unit1 };

async function seedUnits() {
  await UnitModel.create([
    { ...unit1, active: true },
    { ...unit2, active: true },
  ]);
}

describe('calls routes', () => {
  let mongo: MongoMemoryReplSet;
  let attachmentRoot: string | null = null;
  async function useAttachmentRoot() {
    attachmentRoot = await mkdtemp(join(tmpdir(), 'sigat-call-attachments-'));
    process.env.SIGAT_ATTACHMENT_STORAGE_DIR = attachmentRoot;
    return attachmentRoot;
  }
  beforeAll(async () => { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await connectToDatabase(mongo.getUri()); await Promise.all([CallModel.init(), EquipmentModel.init(), UserModel.init(), SessionModel.init(), AuditEventModel.init(), UnitModel.init()]); });
  beforeEach(async () => { await seedUnits(); });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    vi.restoreAllMocks();
    delete process.env.SIGAT_ATTACHMENT_STORAGE_DIR;
    if (attachmentRoot) {
      await rm(attachmentRoot, { recursive: true, force: true });
      attachmentRoot = null;
    }
  });
  afterAll(async () => { await disconnectFromDatabase(); await mongo.stop(); });

  it('accepts frontend technical priority and returns display priority', async () => {
    const response = await request(appFor(user)).post('/api/v1/calls').set('Cookie', 'sigat_session=test').field('problem', 'software').field('priority', 'medium').field('subject', 'Acesso').field('description', 'Não consigo acessar');
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ protocol: expect.stringMatching(/^CH-2026-\d{6}$/) });
    expect(await CallModel.findOne({ _id: response.body.id }).lean()).toMatchObject({ priority: 'Média', unit: unit1, createdBy: 'user-1' });
  });

  it('lists only the unit for unit_user and all calls for DITEL', async () => {
    await CallModel.create([{ protocol: 'CH-2026-000001', problem: 'software', priority: 'Baixa', subject: 'A', description: 'A', section: 'Suporte', status: 'Aberto', unit: unit1, createdBy: 'u' }, { protocol: 'CH-2026-000002', problem: 'radio', priority: 'Crítica', subject: 'B', description: 'B', section: 'Telecom', status: 'Aberto', unit: unit2, createdBy: 'v' }]);
    const unitResponse = await request(appFor(user)).get('/api/v1/calls').set('Cookie', 'sigat_session=test');
    expect(unitResponse.body.items).toHaveLength(1);
    expect(unitResponse.body.items[0].priority).toBe('Baixa');
    expect((await request(appFor({ ...user, userId: 'admin', role: 'ditel_admin', unit: null })).get('/api/v1/calls').set('Cookie', 'sigat_session=test')).body.items).toHaveLength(2);
  });

  it('returns scoped call details with persisted public fields and audit-derived history', async () => {
    const equipment = await EquipmentModel.create({ patrimony: 'PAT-DETAIL', type: 'Switch', model: 'SG-900', brand: 'TP-Link', situation: 'active', location: 'Rack', unit: unit1 });
    const call = await CallModel.create({ protocol: 'CH-2026-000020', problem: 'network', priority: 'Alta', subject: 'Rede instável', description: 'Descrição persistida do chamado', section: 'Telecom', status: 'Em atendimento', unit: unit1, equipmentId: equipment.id, createdBy: 'user-1', updatedBy: 'admin' });
    await AuditEventModel.create({
      action: 'calls.triage',
      module: 'calls',
      userId: 'admin',
      actor: { id: 'admin', name: 'Admin', registration: '2', role: 'ditel_admin' },
      entity: { type: 'call', id: call.id, label: call.protocol },
      unit: unit1,
      result: 'success',
      reason: null,
      before: { status: 'Aberto', priority: 'Baixa', section: 'Suporte' },
      after: { status: 'Em atendimento', priority: 'Alta', section: 'Telecom' },
      retentionExpiresAt: new Date('2032-01-01T00:00:00.000Z'),
    });

    const response = await request(appFor(user)).get(`/api/v1/calls/${call.id}`).set('Cookie', 'sigat_session=test');
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['attachments', 'description', 'equipment', 'history', 'id', 'openedAt', 'priority', 'problem', 'protocol', 'requestedBy', 'section', 'status', 'subject', 'unit', 'updatedAt']);
    expect(response.body).toMatchObject({
      id: call.id,
      protocol: 'CH-2026-000020',
      problem: 'network',
      subject: 'Rede instável',
      description: 'Descrição persistida do chamado',
      priority: 'Alta',
      status: 'Em atendimento',
      section: 'Telecom',
      requestedBy: 'user-1',
      unit: unit1,
      attachments: [],
      equipment: { id: equipment.id, patrimony: 'PAT-DETAIL', type: 'Switch', model: 'SG-900', brand: 'TP-Link' },
      history: expect.arrayContaining([
        expect.objectContaining({ id: `call-opened-${call.id}`, description: 'Chamado aberto pela Unidade.' }),
        expect.objectContaining({ description: 'Triagem DITEL registrada: Aberto → Em atendimento.' }),
      ]),
    });
    expect(JSON.stringify(response.body)).not.toMatch(/createdBy|updatedBy|passwordHash|password|senha|token|tokenDigest|sessionId|registration/i);

    const outsideScope = await request(appFor({ ...user, userId: 'other', unit: unit2 })).get(`/api/v1/calls/${call.id}`).set('Cookie', 'sigat_session=test');
    expect(outsideScope.status).toBe(404);

    const adminResponse = await request(appFor({ ...user, userId: 'admin', role: 'ditel_admin', unit: null })).get(`/api/v1/calls/${call.id}`).set('Cookie', 'sigat_session=test');
    expect(adminResponse.status).toBe(200);
  });

  it('rejects unsupported call status values at model validation level', async () => {
    await expect(CallModel.create({ protocol: 'CH-2026-000021', problem: 'software', priority: 'Baixa', subject: 'A', description: 'A', section: 'Suporte', status: 'Cancelado', unit: unit1, createdBy: 'u' })).rejects.toThrow(/status/);
  });

  it.each([
    ['inactive', async () => {
      await UnitModel.updateOne({ id: unit1.id }, { $set: { active: false } });
    }],
    ['missing', async () => {
      await UnitModel.deleteOne({ id: unit1.id });
    }],
  ])('rejects GET /api/v1/calls when the canonical unit is %s', async (_state, invalidateUnit) => {
    await invalidateUnit();

    const response = await request(appFor(user))
      .get('/api/v1/calls')
      .set('Cookie', 'sigat_session=test');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Escopo de unidade obrigatório.',
    });
  });

  it('forbids DITEL creation', async () => {
    const admin = { ...user, userId: 'admin', role: 'ditel_admin' as const, unit: null };
    expect((await request(appFor(admin)).post('/api/v1/calls').set('Cookie', 'sigat_session=test').field('problem', 'software').field('priority', 'low').field('subject', 'A').field('description', 'B')).status).toBe(403);
  });

  it('stores call attachments as metadata and downloads only for authorized scopes', async () => {
    const root = await useAttachmentRoot();
    const response = await request(appFor(user))
      .post('/api/v1/calls')
      .set('Cookie', 'sigat_session=test')
      .field('problem', 'software')
      .field('priority', 'low')
      .field('subject', 'Sistema')
      .field('description', 'Falha com evidência')
      .attach('attachments', Buffer.from('evidência png'), { filename: 'evidencia.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    const storedFiles = await readdir(root);
    expect(storedFiles).toHaveLength(1);
    expect(storedFiles[0]).not.toContain('evidencia');

    const details = await request(appFor(user)).get(`/api/v1/calls/${response.body.id}`).set('Cookie', 'sigat_session=test');
    expect(details.status).toBe(200);
    expect(details.body.attachments).toEqual([
      expect.objectContaining({ id: expect.any(String), name: 'evidencia.png', type: 'image/png', size: expect.any(Number), downloadUrl: expect.stringMatching(/^\/api\/v1\/attachments\/.+\/download$/), status: 'active' }),
    ]);
    expect(JSON.stringify(details.body)).not.toMatch(/storageKey|path|passwordHash|password|senha|token|tokenDigest|sessionId/i);

    const download = await request(appFor(user)).get(details.body.attachments[0].downloadUrl).set('Cookie', 'sigat_session=test');
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('image/png');
    expect(download.headers['content-disposition']).toContain('evidencia.png');
    expect(download.body.toString()).toContain('evidência png');

    const ditel = await request(appFor({ ...user, userId: 'admin', role: 'ditel_admin', unit: null })).get(details.body.attachments[0].downloadUrl).set('Cookie', 'sigat_session=test');
    expect(ditel.status).toBe(200);

    const outside = await request(appFor({ ...user, userId: 'other', unit: unit2 })).get(details.body.attachments[0].downloadUrl).set('Cookie', 'sigat_session=test');
    expect(outside.status).toBe(404);
  });

  it('rejects an equipment from another unit and records successful creation audit', async () => {
    const equipment = await EquipmentModel.create({ patrimony: 'P', type: 'Rádio', model: 'M', brand: 'B', situation: 'active', location: 'L', unit: unit2 });
    const denied = await request(appFor(user)).post('/api/v1/calls').set('Cookie', 'sigat_session=test').field('problem', 'hardware').field('priority', 'high').field('subject', 'A').field('description', 'B').field('equipmentId', equipment.id);
    expect(denied.status).toBe(404);
    await request(appFor(user)).post('/api/v1/calls').set('Cookie', 'sigat_session=test').field('problem', 'hardware').field('priority', 'critical').field('subject', 'A').field('description', 'B');
    expect(await AuditEventModel.countDocuments({ action: 'calls.create', result: 'success', userId: 'user-1' })).toBe(1);
  });

  it('rolls back call creation when the success audit cannot be persisted', async () => {
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('simulated audit outage') as never);

    const response = await request(appFor(user))
      .post('/api/v1/calls')
      .set('Cookie', 'sigat_session=test')
      .field('problem', 'software')
      .field('priority', 'medium')
      .field('subject', 'Acesso')
      .field('description', 'Não consigo acessar');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'AUDIT_UNAVAILABLE',
      message: 'Não foi possível registrar auditoria.',
    });
    expect(await CallModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: 'calls.create' })).toBe(0);
  });

  it('retries a protocol collision', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.123456);
    await CallModel.create({ protocol: 'CH-2026-000000', problem: 'software', priority: 'Baixa', subject: 'Já existe', description: 'x', section: 'Suporte', status: 'Aberto', unit: unit1, createdBy: 'old' });
    const created = await createCall({ problem: 'software', priority: 'Baixa', subject: 'Novo', description: 'x', unit: unit1, createdBy: 'new' });
    expect(created.protocol).toBe('CH-2026-123456'); expect(random).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid call attachment type and oversized file without creating a call', async () => {
    await useAttachmentRoot();
    const invalid = await request(appFor(user)).post('/api/v1/calls').set('Cookie', 'sigat_session=test').field('problem', 'software').field('priority', 'low').field('subject', 'A').field('description', 'B').attach('attachments', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ code: 'INVALID_ATTACHMENT_TYPE', message: 'Tipo de anexo não permitido. Use documentos PDF/DOC/DOCX ou fotos JPG/PNG/WEBP/GIF.' });

    const oversized = await request(appFor(user)).post('/api/v1/calls').set('Cookie', 'sigat_session=test').field('problem', 'software').field('priority', 'low').field('subject', 'A').field('description', 'B').attach('attachments', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'large.pdf', contentType: 'application/pdf' });
    expect(oversized.status).toBe(400);
    expect(oversized.body).toEqual({ code: 'ATTACHMENT_TOO_LARGE', message: 'Cada anexo deve ter no máximo 10 MiB.' });
    expect(await CallModel.countDocuments({ subject: 'A' })).toBe(0);
  });

  it('cleans files written during a call creation rollback', async () => {
    const root = await useAttachmentRoot();
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('simulated audit outage') as never);

    const response = await request(appFor(user))
      .post('/api/v1/calls')
      .set('Cookie', 'sigat_session=test')
      .field('problem', 'software')
      .field('priority', 'medium')
      .field('subject', 'Rollback')
      .field('description', 'Falha com arquivo')
      .attach('attachments', Buffer.from('%PDF-1.4 rollback'), { filename: 'rollback.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(503);
    expect(await CallModel.countDocuments({ subject: 'Rollback' })).toBe(0);
    expect(await readdir(root)).toHaveLength(0);
  });

  it('allows only DITEL to triage and audits without sensitive data', async () => {
    const call = await CallModel.create({ protocol: 'CH-2026-000010', problem: 'software', priority: 'Baixa', subject: 'Acesso', description: 'segredo não deve ir para auditoria', section: 'Suporte', status: 'Aberto', unit: unit1, createdBy: 'u' });
    const before = call.updatedAt.toISOString();
    const denied = await request(appFor(user)).patch(`/api/v1/calls/${call.id}/triage`).set('Cookie', 'sigat_session=test').send({ status: 'Resolvido', priority: 'high', section: 'Telecom', updatedAt: before });
    expect(denied.status).toBe(403);
    const admin = { ...user, userId: 'admin', role: 'ditel_admin' as const, unit: null };
    const response = await request(appFor(admin)).patch(`/api/v1/calls/${call.id}/triage`).set('Cookie', 'sigat_session=test').send({ status: 'Resolvido', priority: 'high', section: 'Telecom', updatedAt: before });
    expect(response.status).toBe(200); expect(response.body).toMatchObject({ status: 'Resolvido', priority: 'Alta', section: 'Telecom' });
    const event = await AuditEventModel.findOne({ action: 'calls.triage', result: 'success' }).lean();
    expect(event).toMatchObject({
      action: 'calls.triage',
      module: 'calls',
      userId: 'admin',
      actor: { id: 'admin', name: 'Ana', registration: '1', role: 'ditel_admin' },
      entity: { type: 'call', id: call.id, label: 'CH-2026-000010' },
      unit: unit1,
      result: 'success',
      reason: null,
      before: { status: 'Aberto', priority: 'Baixa', section: 'Suporte' },
      after: { status: 'Resolvido', priority: 'Alta', section: 'Telecom' },
    });
    expect(JSON.stringify(event)).not.toMatch(/description|segredo|passwordHash|password|senha|token|tokenDigest|sessionId/i);
  });

  it('rolls back call triage when the success audit cannot be persisted', async () => {
    const call = await CallModel.create({ protocol: 'CH-2026-000012', problem: 'software', priority: 'Baixa', subject: 'Acesso', description: 'Falha temporária', section: 'Suporte', status: 'Aberto', unit: unit1, createdBy: 'u' });
    const admin = { ...user, userId: 'admin', role: 'ditel_admin' as const, unit: null };
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('simulated audit outage') as never);

    const response = await request(appFor(admin))
      .patch(`/api/v1/calls/${call.id}/triage`)
      .set('Cookie', 'sigat_session=test')
      .send({ status: 'Resolvido', priority: 'high', section: 'Telecom', updatedAt: call.updatedAt.toISOString() });
    const persisted = await CallModel.findById(call.id).lean().orFail();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'AUDIT_UNAVAILABLE',
      message: 'Não foi possível registrar auditoria.',
    });
    expect(persisted).toMatchObject({
      status: 'Aberto',
      priority: 'Baixa',
      section: 'Suporte',
    });
    expect(await AuditEventModel.countDocuments({ action: 'calls.triage' })).toBe(0);
  });

  it('rejects invalid triage values and stale versions', async () => {
    const call = await CallModel.create({ protocol: 'CH-2026-000011', problem: 'radio', priority: 'Crítica', subject: 'Rádio', description: 'Falha', section: 'Telecom', status: 'Aberto', unit: unit1, createdBy: 'u' });
    const admin = { ...user, userId: 'admin', role: 'ditel_admin' as const, unit: null };
    const invalid = await request(appFor(admin)).patch(`/api/v1/calls/${call.id}/triage`).set('Cookie', 'sigat_session=test').send({ status: 'Cancelado', priority: 'urgent', section: 'Outra', updatedAt: call.updatedAt.toISOString() });
    expect(invalid.status).toBe(400);
    const conflict = await request(appFor(admin)).patch(`/api/v1/calls/${call.id}/triage`).set('Cookie', 'sigat_session=test').send({ status: 'Encerrado', priority: 'critical', section: 'Telecom', updatedAt: new Date(0).toISOString() });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ code: 'USER_CONFLICT', message: 'O chamado foi alterado por outra operação. Recarregue os dados e tente novamente.' });
    const stored = await CallModel.findById(call.id).lean().orFail();
    expect(stored).toMatchObject({ status: 'Aberto', priority: 'Crítica', section: 'Telecom' });
    const event = await AuditEventModel.findOne({ action: 'calls.triage', result: 'failure' }).lean();
    expect(event).toMatchObject({ action: 'calls.triage', userId: 'admin', result: 'failure', reason: null });
    expect(JSON.stringify(event)).not.toMatch(/passwordHash|password|senha|token|tokenDigest|sessionId/i);
  });

  it('rejects extra triage payload fields without mutating or exposing secrets', async () => {
    const call = await CallModel.create({ protocol: 'CH-2026-000013', problem: 'radio', priority: 'Crítica', subject: 'Rádio', description: 'Falha', section: 'Telecom', status: 'Aberto', unit: unit1, createdBy: 'u' });
    const admin = { ...user, userId: 'admin', role: 'ditel_admin' as const, unit: null };
    const response = await request(appFor(admin))
      .patch(`/api/v1/calls/${call.id}/triage`)
      .set('Cookie', 'sigat_session=test')
      .send({ status: 'Resolvido', priority: 'high', section: 'Suporte', updatedAt: call.updatedAt.toISOString(), description: 'não aceite', token: 'secret' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVALID_TRIAGE', message: 'Dados de triagem inválidos.' });
    expect(await CallModel.findById(call.id).lean()).toMatchObject({ status: 'Aberto', priority: 'Crítica', section: 'Telecom' });
    expect(JSON.stringify(response.body)).not.toMatch(/description|secret|token|passwordHash|sessionId/i);
  });

  it('returns 404 for a valid but nonexistent call and 409 only for stale versions', async () => {
    const admin = { ...user, userId: 'admin', role: 'ditel_admin' as const, unit: null };
    const missing = await request(appFor(admin)).patch('/api/v1/calls/507f1f77bcf86cd799439011/triage').set('Cookie', 'sigat_session=test').send({ status: 'Resolvido', priority: 'high', section: 'Suporte', updatedAt: new Date().toISOString() });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });
});
