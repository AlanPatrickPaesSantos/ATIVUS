import mongoose from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { LoginRateLimitCounterModel } from '../models/LoginRateLimitCounter.js';
import { MovementModel } from '../models/Movement.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';
import {
  bootstrapHomologation,
  readHomologationReport,
} from './homologation.js';

async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map(async (collection) => collection.deleteMany({})));
}

describe('homologation operations', () => {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(replSet.getUri());
    await Promise.all([
      AuditEventModel.init(),
      CallModel.init(),
      EquipmentModel.init(),
      LoginRateLimitCounterModel.init(),
      MovementModel.init(),
      SessionModel.init(),
      UnitModel.init(),
      UserModel.init(),
    ]);
  });

  afterEach(async () => {
    delete process.env.HOMOLOGATION_SEED_PASSWORD;
    delete process.env.NODE_ENV;
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await replSet.stop();
  });

  it('reports missing indexes before bootstrap and validates them afterwards', async () => {
    await EquipmentModel.collection.dropIndexes();

    const before = await readHomologationReport();
    expect(before.transactionSupport).toBe('supported');
    expect(before.indexesReady).toBe(false);
    expect(before.missingIndexes.some((entry) => entry.model === 'Equipment')).toBe(true);

    const after = await bootstrapHomologation();

    expect(after.transactionSupport).toBe('supported');
    expect(after.indexesReady).toBe(true);
    expect(after.missingIndexes).toEqual([]);
  });

  it('creates a minimal synthetic seed only when explicitly requested', async () => {
    process.env.HOMOLOGATION_SEED_PASSWORD = 'homolog-password';

    const report = await bootstrapHomologation({ seedNonProd: true });
    const users = await UserModel.find({}, { registration: 1, role: 1, _id: 0 }).sort({ registration: 1 }).lean();
    const units = await UnitModel.find({}, { id: 1, _id: 0 }).sort({ id: 1 }).lean();

    expect(report.seeded).toBe(true);
    expect(users).toEqual([
      { registration: 'hml-admin', role: 'ditel_admin' },
      { registration: 'hml-unit', role: 'unit_user' },
    ]);
    expect(units).toEqual([
      { id: 'hml-unit' },
    ]);
  });

  it('rejects the non-production seed without an explicit password', async () => {
    await expect(bootstrapHomologation({ seedNonProd: true })).rejects.toThrow(
      'HOMOLOGATION_SEED_PASSWORD is required for the non-production seed.',
    );
  });

  it('rejects the synthetic seed when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HOMOLOGATION_SEED_PASSWORD = 'homolog-password';

    await expect(bootstrapHomologation({ seedNonProd: true })).rejects.toThrow(
      'Non-production seed is forbidden when NODE_ENV=production.',
    );
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await UnitModel.countDocuments()).toBe(0);
  });
});

describe('homologation transaction support', () => {
  let standalone: MongoMemoryServer;

  beforeAll(async () => {
    standalone = await MongoMemoryServer.create();
    await connectToDatabase(standalone.getUri());
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await standalone.stop();
  });

  it('fails bootstrap when MongoDB does not support transactions', async () => {
    await expect(bootstrapHomologation()).rejects.toThrow(
      'MongoDB deployment does not support transactions required by SIGAT.',
    );
  });
});
