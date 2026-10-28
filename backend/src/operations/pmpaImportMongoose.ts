import mongoose, { type ClientSession } from 'mongoose';

import { EquipmentModel } from '../models/Equipment.js';
import { UnitModel } from '../models/Unit.js';
import type { ExistingEquipment, ExistingOrganization, ImportAdapter, ImportExistingState, ImportTransaction, PlannedEquipment, PlannedOrganization, RollbackAdapter, RollbackInput, RollbackTransaction } from './pmpaImport.js';

function equipmentDocument(record: PlannedEquipment) {
  const { generatedId: _generatedId, ...document } = record;
  return document;
}

function transactionAdapter(session: ClientSession): ImportTransaction & RollbackTransaction {
  return {
    async insertOrganizations(records: PlannedOrganization[]) {
      if (records.length) await UnitModel.insertMany(records, { session, ordered: true });
    },
    async insertEquipment(records: PlannedEquipment[]) {
      if (records.length) await EquipmentModel.insertMany(records.map(equipmentDocument), { session, ordered: true });
    },
    async deleteEquipment(patrimonies: string[], batchId: string) {
      if (!patrimonies.length) return;
      const result = await EquipmentModel.deleteMany({ patrimony: { $in: patrimonies }, 'provenance.importBatchId': batchId }, { session }).exec();
      if (result.deletedCount !== patrimonies.length) throw new Error('rollback_equipment_target_changed');
    },
    async deleteOrganizations(ids: string[], batchId: string) {
      if (!ids.length) return;
      const result = await UnitModel.deleteMany({ id: { $in: ids }, importBatchId: batchId }, { session }).exec();
      if (result.deletedCount !== ids.length) throw new Error('rollback_organization_target_changed');
    },
  };
}

export interface MongoosePmpaImportAdapter extends ImportAdapter, RollbackAdapter {
  loadExistingState(unitIds: string[], patrimonies: string[]): Promise<ImportExistingState>;
  loadRollbackInput(batchId: string): Promise<RollbackInput>;
}

export function isAutoIndexSafe(connection: Pick<typeof mongoose, 'get'>): boolean {
  return connection.get('autoIndex') === false;
}

export function createMongoosePmpaImportAdapter(connection = mongoose): MongoosePmpaImportAdapter {
  const transaction = async <T>(work: (tx: ImportTransaction & RollbackTransaction) => Promise<T>): Promise<T> => {
    if (!isAutoIndexSafe(connection)) throw new Error('auto_index_must_be_disabled_before_import');
    const session = await connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => { result = await work(transactionAdapter(session)); });
      return result;
    } finally {
      await session.endSession();
    }
  };

  return {
    transaction,
    async loadExistingState(unitIds, patrimonies): Promise<ImportExistingState> {
      const [units, equipment] = await Promise.all([
        UnitModel.find({ id: { $in: unitIds } }).lean().exec(),
        EquipmentModel.find({ patrimony: { $in: patrimonies } }).lean().exec(),
      ]);
      return { units: units as ExistingOrganization[], equipment: equipment as ExistingEquipment[] };
    },
    async loadRollbackInput(batchId): Promise<RollbackInput> {
      const [units, equipment] = await Promise.all([
        UnitModel.find({ importBatchId: batchId }).select({ id: 1, importBatchId: 1, _id: 0 }).lean().exec(),
        EquipmentModel.find({ 'provenance.importBatchId': batchId }).select({ patrimony: 1, 'provenance.importBatchId': 1, _id: 0 }).lean().exec(),
      ]);
      const unitIds = units.map((unit) => unit.id);
      const dependencies = unitIds.length === 0 ? [] : await readDependencies(connection, unitIds);
      return {
        batchId,
        units: units.map((unit) => ({ id: unit.id, ...(unit.importBatchId ? { importBatchId: unit.importBatchId } : {}) })),
        equipment: equipment.map((item) => ({ patrimony: item.patrimony, ...(item.provenance?.importBatchId ? { importBatchId: item.provenance.importBatchId } : {}) })),
        dependencies,
      };
    },
  };
}

async function readDependencies(connection: typeof mongoose, unitIds: string[]): Promise<RollbackInput['dependencies']> {
  const references = [
    { collection: 'users', filter: { 'unit.id': { $in: unitIds } } },
    { collection: 'movements', filter: { $or: [{ 'origin.id': { $in: unitIds } }, { 'destination.id': { $in: unitIds } }] } },
    { collection: 'missions', filter: { 'unit.id': { $in: unitIds } } },
    { collection: 'calls', filter: { 'unit.id': { $in: unitIds } } },
    { collection: 'maintenances', filter: { 'unit.id': { $in: unitIds } } },
  ];
  const results = await Promise.all(references.map(async ({ collection, filter }) => {
    const documents = await connection.connection.collection(collection).find(filter).project({ _id: 1, 'unit.id': 1, 'origin.id': 1, 'destination.id': 1 }).toArray();
    return documents.map((document) => ({ type: collection, id: String(document._id), unitId: (document.unit?.id ?? document.origin?.id ?? document.destination?.id) as string | undefined }));
  }));
  return results.flat();
}
