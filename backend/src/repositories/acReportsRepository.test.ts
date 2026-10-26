import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AcTransferModel } from '../models/AcTransfer.js';
import { EquipmentModel } from '../models/Equipment.js';
import { readAcPatrimonialReport } from './acReportsRepository.js';

const destination = { id: 'unit-report', name: 'Unidade Relatório', acronym: 'UR' };
const otherDestination = { id: 'unit-other', name: 'Outra Unidade', acronym: 'OU' };

describe('AC patrimonial reports repository', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([EquipmentModel.init(), AcTransferModel.init()]);
  });

  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('counts available stock and distributed equipment by distinct equipment id', async () => {
    const first = await EquipmentModel.create({
      patrimony: 'RP-REPORT-1', type: 'Rádio', model: 'APX', brand: 'Motorola', situation: 'active', location: 'AC',
      serialNumber: 'SN-1', category: 'Comunicação', unit: null, custody: { scope: 'AC', unit: null },
      history: [{ id: 'h-1', description: 'Entrada patrimonial na AC', occurredAt: new Date('2026-10-01') }],
    });
    const second = await EquipmentModel.create({
      patrimony: 'RP-REPORT-2', type: 'Notebook', model: 'T14', brand: 'Lenovo', situation: 'active', location: 'AC',
      serialNumber: 'SN-2', category: 'Informática', unit: null, custody: { scope: 'AC', unit: null }, history: [],
    });

    await AcTransferModel.create([
      { origin: 'AC', status: 'confirmed', destinationUnit: destination, distributedAt: new Date('2026-10-10'), deliverer: { name: 'Entrega 1' }, receiver: { name: 'Recebe 1' }, materials: [{ equipmentId: String(first.id), patrimony: first.patrimony, serialNumber: first.serialNumber, sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: first.updatedAt, equipmentVersion: 0 }], createdBy: 'ac', idempotencyKey: 'report-1', fingerprint: 'f1' },
      { origin: 'AC', status: 'confirmed', destinationUnit: otherDestination, distributedAt: new Date('2026-10-11'), deliverer: { name: 'Entrega 2' }, receiver: { name: 'Recebe 2' }, materials: [{ equipmentId: String(first.id), patrimony: first.patrimony, serialNumber: first.serialNumber, sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: first.updatedAt, equipmentVersion: 0 }], createdBy: 'ac', idempotencyKey: 'report-2', fingerprint: 'f2' },
    ]);

    const report = await readAcPatrimonialReport({ from: '2026-10-01', to: '2026-10-31' }, { page: 1, pageSize: 20, sort: 'distributedAt', order: 'desc' });

    expect(report.metrics).toEqual({ availableStock: 2, distributedGoods: 1, transfers: 2 });
    expect(report.stock.items).toHaveLength(2);
    expect(report.distributions.items[0]).toMatchObject({ destinationUnit: otherDestination, quantity: 1 });
  });

  it('filters distributions and merges equipment history with AC history source', async () => {
    const equipment = await EquipmentModel.create({
      patrimony: 'RP-HISTORY-1', type: 'Rádio', model: 'APX', brand: 'Motorola', situation: 'active', location: 'AC',
      unit: null, custody: { scope: 'AC', unit: null }, history: [{ id: 'ditel-1', description: 'Movimentação DITEL', occurredAt: new Date('2026-09-01') }],
    });
    await AcTransferModel.create({
      origin: 'AC', status: 'confirmed', destinationUnit: destination, distributedAt: new Date('2026-10-12'), bg: { number: 'BG-77' }, deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' }, materials: [{ equipmentId: String(equipment.id), patrimony: equipment.patrimony, sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: equipment.updatedAt, equipmentVersion: 0 }], createdBy: 'ac', idempotencyKey: 'history-1', fingerprint: 'hf1',
    });

    const report = await readAcPatrimonialReport({ unitId: destination.id, bg: 'BG-77', patrimony: 'RP-HISTORY-1' }, { page: 1, pageSize: 20, sort: 'distributedAt', order: 'asc' });

    expect(report.distributions.total).toBe(1);
    expect(report.history).toMatchObject({ patrimony: 'RP-HISTORY-1', entries: [
      { source: 'DITEL', description: 'Movimentação DITEL' },
      { source: 'AC', description: 'Distribuição AC', bg: 'BG-77' },
    ] });
  });
});
