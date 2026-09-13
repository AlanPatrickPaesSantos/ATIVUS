import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { EquipmentModel } from '../models/Equipment.js';
import { MovementModel } from '../models/Movement.js';
import { createMovement, decideMovement } from './movementsRepository.js';

describe('movement approval transaction', () => {
  let mongo: MongoMemoryReplSet;
  beforeAll(async () => { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await connectToDatabase(mongo.getUri()); await Promise.all([EquipmentModel.init(), MovementModel.init()]); });
  afterEach(async () => { await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))); vi.restoreAllMocks(); });
  afterAll(async () => { await disconnectFromDatabase(); await mongo.stop(); });

  it('rolls back equipment when movement update fails', async () => {
    const origin = { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' } as const;
    const destination = { id: 'unit-2', name: 'Unidade 2', acronym: 'U2' } as const;
    const equipment = await EquipmentModel.create({ patrimony: 'PAT-TX', type: 'Rádio', model: 'X', brand: 'B', situation: 'active', location: 'Sala', unit: origin, history: [{ id: 'initial', description: 'Cadastro inicial', occurredAt: new Date() }] });
    const movement = await createMovement({ equipmentId: String(equipment._id), origin, destination, requestedBy: 'user-1' });
    const movementUpdate = vi.spyOn(MovementModel, 'findOneAndUpdate').mockImplementationOnce(() => ({ lean: () => ({ exec: async () => { throw new Error('simulated second-operation failure'); } }) } as never));

    await expect(decideMovement({ id: movement.id, updatedAt: new Date(movement.updatedAt), status: 'Aprovada', decidedBy: 'ditel-1' })).rejects.toThrow('simulated second-operation failure');
    const persistedEquipment = await EquipmentModel.findById(equipment._id).lean().orFail();
    const persistedMovement = await MovementModel.findById(movement.id).lean().orFail();
    expect(persistedEquipment.unit.id).toBe(origin.id);
    expect(persistedEquipment.history).toHaveLength(1);
    expect(persistedMovement.status).toBe('Pendente');
    expect(movementUpdate).toHaveBeenCalled();
  });
});
