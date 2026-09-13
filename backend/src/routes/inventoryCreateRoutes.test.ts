import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EquipmentModel } from '../models/Equipment.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { UnitModel } from '../models/Unit.js';
import { createApp } from '../app.js';
import type { SessionContext, SessionService } from '../auth/sessionService.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';

const unit1 = { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' };
function sessionServiceFor(context: SessionContext): SessionService { return { async login() { throw new Error('unused'); }, async getSessionContext() { return context; }, async logout() {}, async recordMissingSessionCookie() {} }; }

describe('POST /api/v1/inventory', () => {
  let mongo: MongoMemoryReplSet;
  let attachmentRoot: string | null = null;
  async function useAttachmentRoot() {
    attachmentRoot = await mkdtemp(join(tmpdir(), 'sigat-inventory-attachments-'));
    process.env.SIGAT_ATTACHMENT_STORAGE_DIR = attachmentRoot;
    return attachmentRoot;
  }
  beforeAll(async () => { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await connectToDatabase(mongo.getUri()); await Promise.all([EquipmentModel.init(), AuditEventModel.init(), UnitModel.init()]); });
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
  it('creates equipment from the unit session and returns details', async () => {
    await UnitModel.create({ ...unit1, active: true });
    const app = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: unit1, userId: 'user-1', name: 'Ana', registration: '1' }) });
    const response = await request(app).post('/api/v1/inventory').set('Cookie', 'sigat_session=test').send({ patrimony: 'PAT-NEW', section: 'support', type: 'Notebook', model: 'Dell', serialNumber: 'SER-1', brand: 'Dell', category: 'Suporte', hasWarranty: 'yes', warrantyDate: '2027-01-01', situation: 'active', location: 'Sala', observations: 'ok' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ patrimony: 'PAT-NEW', unitName: unit1.name, category: 'Suporte', history: [{ description: 'Cadastro inicial' }] });
    expect(await EquipmentModel.countDocuments({ patrimony: 'PAT-NEW', 'unit.id': unit1.id })).toBe(1);
    expect(await AuditEventModel.exists({ action: 'equipment.create', userId: 'user-1', result: 'success' })).not.toBeNull();
  });

  it('rejects response-only fields that are not part of EquipmentCreateRequest', async () => {
    await UnitModel.create({ ...unit1, active: true });
    const app = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: unit1, userId: 'user-1', name: 'Ana', registration: '1' }) });

    const response = await request(app).post('/api/v1/inventory').set('Cookie', 'sigat_session=test').send({
      patrimony: 'PAT-EXTRA',
      type: 'Notebook',
      model: 'Dell',
      brand: 'Dell',
      situation: 'active',
      location: 'Sala',
      allocation: { location: 'Sala adulterada' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'INVALID_EQUIPMENT', message: 'Dados do equipamento inválidos.' });
    expect(await EquipmentModel.countDocuments({ patrimony: 'PAT-EXTRA' })).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: 'equipment.create' })).toBe(0);
  });

  it('forbids DITEL and rejects duplicate patrimony', async () => {
    await UnitModel.create({ ...unit1, active: true });
    await EquipmentModel.create({ patrimony: 'PAT-DUP', type: 'Notebook', model: 'Dell', brand: 'Dell', situation: 'active', location: 'Sala', unit: unit1 });
    const d = createApp({ sessionService: sessionServiceFor({ role: 'ditel_admin', unit: null, userId: 'admin', name: 'Admin', registration: '2' }) });
    expect((await request(d).post('/api/v1/inventory').set('Cookie', 'sigat_session=test').send({ patrimony: 'PAT-X' })).status).toBe(403);
    const u = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: unit1, userId: 'u', name: 'User', registration: '3' }) });
    expect((await request(u).post('/api/v1/inventory').set('Cookie', 'sigat_session=test').send({ patrimony: 'PAT-DUP', type: 'Notebook', model: 'Dell', brand: 'Dell', situation: 'active', location: 'Sala', category: 'Suporte' })).status).toBe(409);
  });

  it('stores inventory attachments privately and serves downloads only inside the authorized scope', async () => {
    const root = await useAttachmentRoot();
    await UnitModel.create({ ...unit1, active: true });
    const app = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: unit1, userId: 'u', name: 'User', registration: '3' }) });

    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Cookie', 'sigat_session=test')
      .field('patrimony', 'PAT-DOC')
      .field('type', 'Notebook')
      .field('model', 'Dell')
      .field('brand', 'Dell')
      .field('situation', 'active')
      .field('location', 'Sala')
      .field('category', 'Suporte')
      .attach('attachments', Buffer.from('%PDF-1.4 documento'), { filename: 'Termo Responsabilidade.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(201);
    expect(response.body.documents).toEqual([
      expect.objectContaining({ id: expect.any(String), name: 'Termo Responsabilidade.pdf', type: 'application/pdf', size: expect.any(Number), downloadUrl: expect.stringMatching(/^\/api\/v1\/attachments\/.+\/download$/), status: 'active' }),
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|path|passwordHash|password|senha|token|tokenDigest|sessionId/i);
    const storedFiles = await readdir(root);
    expect(storedFiles).toHaveLength(1);
    expect(storedFiles[0]).not.toContain('Termo');

    const details = await request(app).get(`/api/v1/inventory/${response.body.id}`).set('Cookie', 'sigat_session=test');
    expect(details.body.documents[0]).toMatchObject({ name: 'Termo Responsabilidade.pdf', type: 'application/pdf' });

    const download = await request(app).get(details.body.documents[0].downloadUrl).set('Cookie', 'sigat_session=test');
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition']).toContain('Termo%20Responsabilidade.pdf');
    expect(download.body.toString()).toContain('%PDF-1.4');

    await UnitModel.create({ id: 'unit-2', name: '2ª Companhia', acronym: '2CIA', active: true });
    const outside = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: { id: 'unit-2', name: '2ª Companhia', acronym: '2CIA' }, userId: 'other', name: 'Outra', registration: '4' }) });
    const denied = await request(outside).get(details.body.documents[0].downloadUrl).set('Cookie', 'sigat_session=test');
    expect(denied.status).toBe(404);
  });

  it('rejects invalid inventory attachment type and oversized file without creating equipment', async () => {
    await useAttachmentRoot();
    await UnitModel.create({ ...unit1, active: true });
    const app = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: unit1, userId: 'u', name: 'User', registration: '3' }) });

    const invalidType = await request(app)
      .post('/api/v1/inventory')
      .set('Cookie', 'sigat_session=test')
      .field('patrimony', 'PAT-BAD-TYPE')
      .field('type', 'Notebook')
      .field('model', 'Dell')
      .field('brand', 'Dell')
      .field('situation', 'active')
      .field('location', 'Sala')
      .attach('attachments', Buffer.from('fake'), { filename: 'malware.exe', contentType: 'application/pdf' });

    expect(invalidType.status).toBe(400);
    expect(invalidType.body).toEqual({ code: 'INVALID_ATTACHMENT_TYPE', message: 'Tipo de anexo não permitido. Use PDF, JPG ou PNG.' });

    const oversized = await request(app)
      .post('/api/v1/inventory')
      .set('Cookie', 'sigat_session=test')
      .field('patrimony', 'PAT-BIG')
      .field('type', 'Notebook')
      .field('model', 'Dell')
      .field('brand', 'Dell')
      .field('situation', 'active')
      .field('location', 'Sala')
      .attach('attachments', Buffer.alloc(15 * 1024 * 1024 + 1), { filename: 'large.pdf', contentType: 'application/pdf' });

    expect(oversized.status).toBe(400);
    expect(oversized.body).toEqual({ code: 'ATTACHMENT_TOO_LARGE', message: 'Cada anexo deve ter no máximo 15 MiB.' });
    expect(await EquipmentModel.countDocuments({ patrimony: /^PAT-(BAD|BIG)/ })).toBe(0);
  });

  it('rolls back equipment creation when the success audit cannot be persisted', async () => {
    await UnitModel.create({ ...unit1, active: true });
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('simulated audit outage') as never);
    const app = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: unit1, userId: 'user-1', name: 'Ana', registration: '1' }) });

    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Cookie', 'sigat_session=test')
      .send({ patrimony: 'PAT-ROLLBACK', type: 'Notebook', model: 'Dell', brand: 'Dell', situation: 'active', location: 'Sala', category: 'Suporte' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'AUDIT_UNAVAILABLE',
      message: 'Não foi possível registrar auditoria.',
    });
    expect(await EquipmentModel.countDocuments({ patrimony: 'PAT-ROLLBACK' })).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: 'equipment.create' })).toBe(0);
  });

  it('cleans files written during an inventory creation rollback', async () => {
    const root = await useAttachmentRoot();
    await UnitModel.create({ ...unit1, active: true });
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('simulated audit outage') as never);
    const app = createApp({ sessionService: sessionServiceFor({ role: 'unit_user', unit: unit1, userId: 'user-1', name: 'Ana', registration: '1' }) });

    const response = await request(app)
      .post('/api/v1/inventory')
      .set('Cookie', 'sigat_session=test')
      .field('patrimony', 'PAT-ROLLBACK-FILE')
      .field('type', 'Notebook')
      .field('model', 'Dell')
      .field('brand', 'Dell')
      .field('situation', 'active')
      .field('location', 'Sala')
      .field('category', 'Suporte')
      .attach('attachments', Buffer.from('%PDF-1.4 rollback'), { filename: 'rollback.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(503);
    expect(await EquipmentModel.countDocuments({ patrimony: 'PAT-ROLLBACK-FILE' })).toBe(0);
    expect(await readdir(root)).toHaveLength(0);
  });
});
