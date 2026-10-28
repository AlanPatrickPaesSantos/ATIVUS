import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { OperationalMaintenanceWindowModel } from '../models/OperationalMaintenanceWindow.js';
import {
  OperationalMaintenanceActiveError,
  assertOperationalWritesOpen,
  readOperationalMaintenanceWindow,
  setOperationalMaintenanceWindow,
} from './operationalMaintenanceRepository.js';

describe('operational maintenance repository', () => {
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

  it('defaults to open without requiring the maintenance collection to exist', async () => {
    await expect(readOperationalMaintenanceWindow()).resolves.toMatchObject({ active: false, revision: 0 });
  });

  it('blocks and reopens writes through the shared persisted state', async () => {
    await setOperationalMaintenanceWindow({ active: true, actorId: 'admin-1', reason: 'Índices' });
    await expect(assertOperationalWritesOpen()).rejects.toBeInstanceOf(OperationalMaintenanceActiveError);

    await setOperationalMaintenanceWindow({ active: false, actorId: 'admin-1', reason: 'Concluído' });
    await expect(assertOperationalWritesOpen()).resolves.toBeUndefined();
  });

  it('serializes a mutation guard and activation on the same Mongo transaction', async () => {
    const mutationSession = await mongoose.startSession();
    const activationSession = await mongoose.startSession();
    let releaseMutation!: () => void;
    const mutationHold = new Promise<void>((resolve) => { releaseMutation = resolve; });
    let mutationReady!: () => void;
    const ready = new Promise<void>((resolve) => { mutationReady = resolve; });
    try {
      const mutation = mutationSession.withTransaction(async () => {
        await assertOperationalWritesOpen(mutationSession);
        mutationReady();
        await mutationHold;
      });
      await ready;
      const activation = activationSession.withTransaction(async () => setOperationalMaintenanceWindow({ active: true, actorId: 'admin-1', reason: 'Janela' }, activationSession));
      await expect(Promise.race([activation.then(() => 'finished'), new Promise((resolve) => setTimeout(() => resolve('waiting'), 100))])).resolves.toBe('waiting');
      releaseMutation();
      await mutation;
      await activation;
      await expect(assertOperationalWritesOpen()).rejects.toBeInstanceOf(OperationalMaintenanceActiveError);
    } finally {
      releaseMutation();
      await mutationSession.endSession();
      await activationSession.endSession();
    }
  }, 15000);
});
