import { describe, expect, it } from 'vitest';

import {
  applyImportPlan,
  buildImportPlan,
  buildRollbackPlan,
  applyRollbackPlan,
  computeManifestDataSha256,
  validateMongoDestination,
  verifyImportManifest,
  type ImportArtifacts,
  type ImportExistingState,
} from './pmpaImport.js';
import { isAutoIndexSafe } from './pmpaImportMongoose.js';

const command = { id: 'pmpa:command:test', name: 'Comando Teste', acronym: 'CT', kind: 'intermediate_command', seatMunicipality: 'Belém', verificationStatus: 'confirmed', sourceIds: ['source'] };
const unit = { id: 'pmpa:unit:test', code: 'BPM-01', name: 'Unidade Teste', acronym: '1º BPM', type: 'BPM', parentCommandId: command.id, activationStatus: 'active', verificationStatus: 'confirmed', independent: false, seatMunicipality: 'Belém', sourceIds: ['source'] };
const equipment = { id: 'pmpa:equipment:test', patrimony: 'PMPA-DEMO-TEST-001', type: 'Rádio comunicador', category: 'Comunicação', model: 'ATV-RD-100', brand: 'Marca Fictícia', situation: 'active', location: 'Sede demonstrativa', unit: { id: unit.id, name: unit.name, acronym: unit.acronym }, provenance: { synthetic: true, generator: 'test', generatorVersion: '1', importBatchId: 'demo-test-batch', source: 'synthetic' } };

function artifacts(overrides: Partial<ImportArtifacts> = {}): ImportArtifacts {
  const base = { schemaVersion: '1.0', generator: 'test', generatorVersion: '1', seed: 'seed', importBatchId: 'demo-test-batch', equipment: [equipment] };
  const dataSha256 = computeManifestDataSha256(base);
  return { catalog: { catalogVersion: 'test', commands: [command], pendingCommands: [], units: [unit] }, equipment: base, manifest: { schemaVersion: '1.0', generator: 'test', generatorVersion: '1', seed: 'seed', importBatchId: base.importBatchId, equipmentCount: 1, eligibleUnitCount: 1, dataSha256 }, ...overrides };
}

const emptyState: ImportExistingState = { units: [], equipment: [] };

describe('PMPA import planner', () => {
  it('verifies the manifest before planning', () => {
    expect(verifyImportManifest(artifacts())).toEqual({ valid: true, errors: [] });
    const invalid = artifacts({ manifest: { ...artifacts().manifest, dataSha256: '0'.repeat(64) } });
    expect(verifyImportManifest(invalid).valid).toBe(false);
  });

  it('plans commands, units and equipment without writing and assigns unit custody', () => {
    const plan = buildImportPlan(artifacts(), emptyState);
    expect(plan.canApply).toBe(true);
    expect(plan.organizationsToCreate).toHaveLength(2);
    expect(plan.equipmentToCreate).toHaveLength(1);
    expect(plan.equipmentToCreate[0].custody).toEqual({ scope: 'UNIT', unit: equipment.unit });
    expect(plan.equipmentToCreate[0].history).toEqual([]);
  });

  it('is idempotent for the same imported organizations and equipment', () => {
    const first = buildImportPlan(artifacts(), emptyState);
    const existing: ImportExistingState = { units: first.organizationsToCreate, equipment: first.equipmentToCreate };
    const second = buildImportPlan(artifacts(), existing);
    expect(second.canApply).toBe(true);
    expect(second.organizationsToCreate).toHaveLength(0);
    expect(second.equipmentToCreate).toHaveLength(0);
    expect(second.existingOrganizations).toBe(2);
    expect(second.existingEquipment).toBe(1);
  });

  it('blocks RP and organization conflicts without overwriting existing records', () => {
    const conflict = buildImportPlan(artifacts(), { units: [{ ...unit, name: 'Outro nome' }], equipment: [{ ...equipment, provenance: undefined }] });
    expect(conflict.canApply).toBe(false);
    expect(conflict.blockers).toEqual(expect.arrayContaining([expect.stringContaining('organization_conflict'), expect.stringContaining('patrimony_conflict')]));
    expect(conflict.organizationsToCreate).toHaveLength(1);
    expect(conflict.equipmentToCreate).toHaveLength(0);
  });

  it('blocks application when a required acronym is absent', () => {
    const incomplete = artifacts({ catalog: { ...artifacts().catalog, units: [{ ...unit, acronym: '' }] } });
    const plan = buildImportPlan(incomplete, emptyState);
    expect(plan.canApply).toBe(false);
    expect(plan.blockers).toContain(`unit_missing_acronym:${unit.id}`);
  });

  it('creates a rollback preview only for records from the requested batch', () => {
    const plan = buildRollbackPlan({ batchId: 'demo-test-batch', units: [{ id: unit.id, importBatchId: 'demo-test-batch' }], equipment: [{ patrimony: equipment.patrimony, importBatchId: 'demo-test-batch' }], dependencies: [] });
    expect(plan.canApply).toBe(true);
    expect(plan.equipmentToDelete).toEqual([equipment.patrimony]);
    expect(plan.unitsToDelete).toEqual([unit.id]);
    const blocked = buildRollbackPlan({ batchId: 'demo-test-batch', units: [{ id: unit.id, importBatchId: 'demo-test-batch' }], equipment: [{ patrimony: equipment.patrimony, importBatchId: 'demo-test-batch' }], dependencies: [{ type: 'user', id: 'user-1', unitId: unit.id }] });
    expect(blocked.canApply).toBe(false);
  });

  it('requires explicit rollback authorization and deletes equipment before units', async () => {
    const plan = buildRollbackPlan({ batchId: 'demo-test-batch', units: [{ id: unit.id, importBatchId: 'demo-test-batch' }], equipment: [{ patrimony: equipment.patrimony, importBatchId: 'demo-test-batch' }], dependencies: [] });
    const calls: string[] = [];
    const adapter = { transaction: async (work: (tx: { insertOrganizations: () => Promise<void>; insertEquipment: () => Promise<void>; deleteEquipment: () => Promise<void>; deleteOrganizations: () => Promise<void> }) => Promise<void>) => work({ insertOrganizations: async () => {}, insertEquipment: async () => {}, deleteEquipment: async () => { calls.push('equipment'); }, deleteOrganizations: async () => { calls.push('organizations'); } }) };
    await expect(applyRollbackPlan(plan, adapter, { authorized: false })).rejects.toThrow('explicit_rollback_authorization_required');
    await expect(applyRollbackPlan(plan, adapter, { authorized: true })).resolves.toEqual({ equipment: 1, organizations: 1 });
    expect(calls).toEqual(['equipment', 'organizations']);
  });

  it('keeps rollback restricted to the requested batch and blocks mixed preexisting records', () => {
    const plan = buildRollbackPlan({
      batchId: 'demo-test-batch',
      units: [
        { id: unit.id, importBatchId: 'demo-test-batch' },
        { id: 'legacy-unit', importBatchId: undefined },
      ],
      equipment: [
        { patrimony: equipment.patrimony, importBatchId: 'demo-test-batch' },
        { patrimony: 'LEGACY-001', importBatchId: undefined },
      ],
      dependencies: [],
    });
    expect(plan.canApply).toBe(false);
    expect(plan.blockers).toContain('rollback_contains_preexisting_units');
    expect(plan.blockers).toContain('rollback_contains_preexisting_equipment');
    expect(plan.equipmentToDelete).toEqual([equipment.patrimony]);
    expect(plan.unitsToDelete).toEqual([unit.id]);
  });

  it('preserves unrelated legacy records in the import plan', () => {
    const legacyUnit = { id: 'legacy-unit', name: 'Unidade Legada', acronym: 'LEG', type: 'BPM' };
    const legacyEquipment = { patrimony: 'LEGACY-001', unit: { id: legacyUnit.id } };
    const plan = buildImportPlan(artifacts(), { units: [legacyUnit], equipment: [legacyEquipment] });
    expect(plan.canApply).toBe(true);
    expect(plan.organizationsToCreate.map((item) => item.id)).toEqual(expect.arrayContaining([command.id, unit.id]));
    expect(plan.equipmentToCreate.map((item) => item.patrimony)).toEqual([equipment.patrimony]);
  });

  it('propagates a transaction failure instead of reporting a completed import', async () => {
    const plan = buildImportPlan(artifacts(), emptyState);
    const calls: string[] = [];
    const adapter = {
      transaction: async (work: (tx: { insertOrganizations: () => Promise<void>; insertEquipment: () => Promise<void> }) => Promise<void>) => {
        await work({
          insertOrganizations: async () => { calls.push('organizations'); },
          insertEquipment: async () => { calls.push('equipment'); },
        });
        throw new Error('simulated_transaction_failure');
      },
    };
    await expect(applyImportPlan(plan, adapter, {
      destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
      authorized: true,
      backupConfirmed: true,
      backupId: 'backup-test',
    })).rejects.toThrow('simulated_transaction_failure');
    expect(calls).toEqual(['organizations', 'equipment']);
  });
});

describe('PMPA import safety', () => {
  it('requires autoIndex to be explicitly disabled before any application', () => {
    expect(isAutoIndexSafe({ get: () => false })).toBe(true);
    expect(isAutoIndexSafe({ get: () => true })).toBe(false);
  });

  it('allows local MongoDB and rejects Atlas or remote destinations by default', () => {
    expect(validateMongoDestination('mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0').valid).toBe(true);
    expect(validateMongoDestination('mongodb+srv://cluster.mongodb.net/ativus').valid).toBe(false);
    expect(validateMongoDestination('mongodb://production.example/ativus').valid).toBe(false);
  });

  it('requires explicit authorization, backup and a valid destination for application', async () => {
    const plan = buildImportPlan(artifacts(), emptyState);
    const calls: string[] = [];
    const adapter = { transaction: async (work: (tx: { insertOrganizations: () => Promise<void>; insertEquipment: () => Promise<void>; deleteEquipment: () => Promise<void>; deleteOrganizations: () => Promise<void> }) => Promise<void>) => work({ insertOrganizations: async () => { calls.push('organizations'); }, insertEquipment: async () => { calls.push('equipment'); }, deleteEquipment: async () => {}, deleteOrganizations: async () => {} }) };
    await expect(applyImportPlan(plan, adapter, { destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0', authorized: false, backupConfirmed: false, backupId: 'backup-test' })).rejects.toThrow('explicit_authorization_required');
    expect(calls).toEqual([]);
    await expect(applyImportPlan(plan, adapter, { destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0', authorized: true, backupConfirmed: true, backupId: 'backup-test' })).resolves.toEqual({ organizations: 2, equipment: 1 });
    expect(calls).toEqual(['organizations', 'equipment']);
  });
});
