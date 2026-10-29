import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type SessionContext, type SessionService } from '../auth/sessionService.js';
import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AcTransferModel } from '../models/AcTransfer.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { EquipmentModel } from '../models/Equipment.js';

const acContext: SessionContext = { userId: 'ac-doc', name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null };
const ditelContext: SessionContext = { userId: 'ditel-doc', name: 'Admin DITEL', registration: '200001', role: 'ditel_admin', unit: null };
const unitContext: SessionContext = { userId: 'unit-doc', name: 'Usuário Unidade', registration: '100001', role: 'unit_user', unit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' } };

function appFor(context?: SessionContext): express.Express {
  const sessionService: SessionService = {
    async login() { throw new Error('unused'); }, async getSessionContext() { return context; }, async logout() {}, async recordMissingSessionCookie() {},
  };
  return createApp({ sessionService });
}

function binaryParser(response: NodeJS.ReadableStream, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error) => callback(error));
}

describe('AC transfer document routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([AcTransferModel.init(), AuditEventModel.init(), EquipmentModel.init()]);
  });
  afterEach(async () => { await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))); });
  afterAll(async () => { await disconnectFromDatabase(); await mongoServer.stop(); });

  async function seedTransfer() {
    return AcTransferModel.create({
      origin: 'AC', status: 'confirmed', destinationUnit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' }, distributedAt: new Date('2026-10-26T10:00:00.000Z'),
      deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' }, materials: [
        { equipmentId: 'equipment-1', patrimony: 'RP-DOC-1', identification: 'Motorola', model: 'APX', serialNumber: 'SN-1', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: new Date('2026-10-25T10:00:00.000Z'), equipmentVersion: 0 },
        { equipmentId: 'equipment-2', patrimony: 'RP-DOC-2', identification: 'Dell', model: 'T14', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: new Date('2026-10-25T10:00:00.000Z'), equipmentVersion: 0 },
      ], createdBy: 'ac-doc', idempotencyKey: `document-${new mongoose.Types.ObjectId()}`, fingerprint: 'document-fingerprint',
    });
  }

  it('allows AC/DITEL, returns DOCX/PDF and re-emits without mutating transfer', async () => {
    const transfer = await seedTransfer();
    const before = await AcTransferModel.findById(transfer.id).lean();
    const docx = await request(appFor(acContext)).get(`/api/v1/ac/transfers/${transfer.id}/document?format=docx`).set('Cookie', 'sigat_session=test').buffer(true).parse(binaryParser);
    const pdf = await request(appFor(ditelContext)).get(`/api/v1/ac/transfers/${transfer.id}/document?format=pdf`).set('Cookie', 'sigat_session=test').buffer(true).parse(binaryParser);
    const replay = await request(appFor(acContext)).get(`/api/v1/ac/transfers/${transfer.id}/document?format=pdf`).set('Cookie', 'sigat_session=test').buffer(true).parse(binaryParser);

    expect(docx.status).toBe(200);
    expect(docx.headers['x-document-template-version']).toBe('ac-transfer-v1');
    expect(docx.headers['x-document-notice']).toBe('MODELO PROVISÓRIO - NÃO OFICIAL');
    expect(docx.headers['x-document-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(docx.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(Buffer.from(docx.body).subarray(0, 2).toString()).toBe('PK');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['x-document-template-version']).toBe('ac-transfer-v1');
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdf.body).toString('latin1')).toContain('%%EOF');
    expect(replay.status).toBe(200);
    expect((await AcTransferModel.findById(transfer.id).lean())?.updatedAt?.toISOString()).toBe(before?.updatedAt?.toISOString());
    const events = await AuditEventModel.find({ action: 'ac.transfer.document.emit', 'entity.id': transfer.id }).sort({ createdAt: 1 }).lean();
    expect(events).toHaveLength(3);
    expect(events.map((event) => (event.after as Record<string, unknown>).format)).toEqual(['docx', 'pdf', 'pdf']);
    expect(events.every((event) => (event.after as Record<string, unknown>).templateVersion === 'ac-transfer-v1')).toBe(true);
    expect(events.every((event) => typeof (event.after as Record<string, unknown>).documentId === 'string')).toBe(true);
    expect(events.every((event) => typeof (event.after as Record<string, unknown>).sha256 === 'string' && String((event.after as Record<string, unknown>).sha256).length === 64)).toBe(true);
    expect((events[0].after as Record<string, unknown>).sha256).not.toBe((events[1].after as Record<string, unknown>).sha256);
  });

  it('rejects unit users, invalid identifiers and unsupported formats', async () => {
    const transfer = await seedTransfer();
    expect((await request(appFor(unitContext)).get(`/api/v1/ac/transfers/${transfer.id}/document?format=pdf`).set('Cookie', 'sigat_session=test')).status).toBe(403);
    expect((await request(appFor(acContext)).get('/api/v1/ac/transfers/not-an-id/document?format=pdf').set('Cookie', 'sigat_session=test')).status).toBe(400);
    expect((await request(appFor(acContext)).get(`/api/v1/ac/transfers/${transfer.id}/document?format=exe`).set('Cookie', 'sigat_session=test')).status).toBe(400);
  });

  it('does not record a successful emission when rendering fails', async () => {
    const transfer = await AcTransferModel.create({
      origin: 'AC', status: 'confirmed', destinationUnit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' }, distributedAt: new Date('2026-10-26T10:00:00.000Z'),
      deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' }, materials: Array.from({ length: 501 }, (_, index) => ({ equipmentId: `equipment-${index}`, patrimony: `RP-${index}`, identification: 'Rádio', model: 'M1', sourceCustody: { scope: 'AC' as const, unit: null }, equipmentUpdatedAt: new Date('2026-10-25T10:00:00.000Z'), equipmentVersion: 0 })), createdBy: 'ac-doc', idempotencyKey: `document-${new mongoose.Types.ObjectId()}`, fingerprint: 'document-failure',
    });
    const response = await request(appFor(acContext)).get(`/api/v1/ac/transfers/${transfer.id}/document?format=pdf`).set('Cookie', 'sigat_session=test');
    expect(response.status).toBe(500);
    expect(await AuditEventModel.countDocuments({ action: 'ac.transfer.document.emit', 'entity.id': transfer.id })).toBe(0);
  });
});
