import crypto from 'node:crypto';

import { validateUnitHierarchy } from '../models/Unit.js';
import type { EquipmentCustody, EquipmentSituation } from '../models/Equipment.js';
import type { UnitReference } from '../models/User.js';
import { validateLocalMongoDestination } from './localMongoDestination.js';

export interface CatalogCommand { id: string; name: string; acronym: string; kind?: string; seatMunicipality?: string | null; verificationStatus: string; sourceIds?: string[] }
export interface CatalogUnit { id: string; code: string; name: string; acronym?: string; type: string; parentCommandId: string | null; activationStatus: string; verificationStatus: string; independent?: boolean; seatMunicipality?: string | null; jurisdictionMunicipalities?: string[]; sourceIds?: string[]; sourceDate?: string; sourceReference?: string }
export interface ImportCatalog { catalogVersion: string; commands: CatalogCommand[]; pendingCommands?: CatalogCommand[]; units: CatalogUnit[]; sources?: Array<{ id: string; date?: string }> }
export interface GeneratedEquipment { id: string; patrimony: string; type: string; category?: string; model: string; brand: string; situation: EquipmentSituation; location: string; unit: UnitReference; provenance: { synthetic: boolean; generator: string; generatorVersion: string; importBatchId: string; source: string } }
export interface GeneratedEquipmentArtifact { schemaVersion: string; generator: string; generatorVersion: string; seed: string; importBatchId: string; equipment: GeneratedEquipment[] }
export interface ImportManifest { schemaVersion: string; generator: string; generatorVersion: string; seed: string; importBatchId: string; equipmentCount: number; eligibleUnitCount: number; dataSha256: string }
export interface ImportArtifacts { catalog: ImportCatalog; equipment: GeneratedEquipmentArtifact; manifest: ImportManifest }
export interface ExistingOrganization { id: string; name: string; acronym: string; active?: boolean; kind?: string; parentUnitId?: string | null; independent?: boolean; seatMunicipality?: string | null; jurisdictionMunicipalities?: string[]; verificationStatus?: string; sourceIds?: string[]; sourceDate?: Date | string; sourceReference?: string; importBatchId?: string }
export interface ExistingEquipment { patrimony: string; type: string; category?: string; model: string; brand: string; situation: EquipmentSituation; location: string; unit: UnitReference | null; custody?: EquipmentCustody | null; provenance?: GeneratedEquipment['provenance']; importBatchId?: string }
export interface ImportExistingState { units: ExistingOrganization[]; equipment: ExistingEquipment[] }
export interface PlannedOrganization extends ExistingOrganization { parentUnitId: string | null; importBatchId: string; active: true; }
export interface PlannedEquipment extends Omit<GeneratedEquipment, 'id' | 'provenance'> { generatedId: string; custody: EquipmentCustody; history: []; provenance: GeneratedEquipment['provenance'] }
export interface ImportPlan { batchId: string; canApply: boolean; blockers: string[]; organizationsToCreate: PlannedOrganization[]; equipmentToCreate: PlannedEquipment[]; existingOrganizations: number; existingEquipment: number; conflicts: string[]; totals: { commands: number; units: number; equipment: number } }
export interface RollbackPlan { batchId: string; canApply: boolean; blockers: string[]; conflicts: string[]; equipmentToDelete: string[]; unitsToDelete: string[] }
export interface RollbackInput { batchId: string; units: Array<{ id: string; importBatchId?: string }>; equipment: Array<{ patrimony: string; importBatchId?: string }>; dependencies: Array<{ type: string; id: string; unitId?: string }> }

const VALID_SITUATIONS = new Set<EquipmentSituation>(['active', 'maintenance', 'inactive', 'lost', 'written_off']);
const UNIT_KIND: Record<string, string> = { BPM: 'bpm', CIPM: 'cipm', CIME: 'cime', CIPAMB: 'cipamb', SPECIALIZED: 'specialized_unit' };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
  return value;
}

export function serializeImportCanonical(value: unknown): string { return `${JSON.stringify(canonicalize(value), null, 2)}\n`; }
export function computeManifestDataSha256(equipment: GeneratedEquipmentArtifact): string { return crypto.createHash('sha256').update(serializeImportCanonical(equipment), 'utf8').digest('hex'); }

export function verifyImportManifest(artifacts: ImportArtifacts): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (artifacts.manifest.importBatchId !== artifacts.equipment.importBatchId) errors.push('manifest_batch_mismatch');
  if (artifacts.manifest.dataSha256 !== computeManifestDataSha256(artifacts.equipment)) errors.push('manifest_sha256_mismatch');
  if (artifacts.manifest.equipmentCount !== artifacts.equipment.equipment.length) errors.push('manifest_equipment_count_mismatch');
  const unitIds = new Set(artifacts.equipment.equipment.map((item) => item.unit.id));
  if (artifacts.manifest.eligibleUnitCount !== unitIds.size) errors.push('manifest_unit_count_mismatch');
  for (const item of artifacts.equipment.equipment) if (item.provenance.importBatchId !== artifacts.manifest.importBatchId) errors.push(`equipment_batch_mismatch:${item.patrimony}`);
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function sourceDate(catalog: ImportCatalog, sourceIds: string[] | undefined): string | undefined {
  const dates = (sourceIds ?? []).map((id) => catalog.sources?.find((source) => source.id === id)?.date).filter((date): date is string => Boolean(date)).sort();
  return dates.at(-1);
}

function commandRecord(command: CatalogCommand, catalog: ImportCatalog, batchId: string): PlannedOrganization {
  return { id: command.id, name: command.name, acronym: command.acronym, active: true, kind: 'intermediate_command', parentUnitId: null, independent: true, seatMunicipality: command.seatMunicipality ?? null, verificationStatus: 'confirmed', sourceIds: command.sourceIds ?? [], sourceDate: sourceDate(catalog, command.sourceIds), sourceReference: (command.sourceIds ?? []).join(','), importBatchId: batchId };
}

function unitRecord(unit: CatalogUnit, catalog: ImportCatalog, batchId: string): PlannedOrganization {
  return { id: unit.id, name: unit.name, acronym: unit.acronym ?? '', active: true, kind: UNIT_KIND[unit.type] ?? 'other', parentUnitId: unit.parentCommandId, independent: unit.independent ?? false, seatMunicipality: unit.seatMunicipality ?? null, jurisdictionMunicipalities: unit.jurisdictionMunicipalities, verificationStatus: 'confirmed', sourceIds: unit.sourceIds ?? [], sourceDate: sourceDate(catalog, unit.sourceIds), sourceReference: unit.sourceReference ?? (unit.sourceIds ?? []).join(','), importBatchId: batchId };
}

function comparableOrganization(value: ExistingOrganization): Record<string, unknown> { return { id: value.id, name: value.name, acronym: value.acronym, active: value.active, kind: value.kind, parentUnitId: value.parentUnitId ?? null, independent: value.independent, seatMunicipality: value.seatMunicipality ?? null, jurisdictionMunicipalities: value.jurisdictionMunicipalities, verificationStatus: value.verificationStatus, sourceIds: value.sourceIds, sourceReference: value.sourceReference, importBatchId: value.importBatchId }; }
function comparableEquipment(value: ExistingEquipment | PlannedEquipment): Record<string, unknown> { return { patrimony: value.patrimony, type: value.type, category: value.category ?? '', model: value.model, brand: value.brand, situation: value.situation, location: value.location, unit: value.unit, custody: value.custody, provenance: value.provenance }; }
function same(value: unknown, expected: unknown): boolean { return serializeImportCanonical(value) === serializeImportCanonical(expected); }

export function buildImportPlan(artifacts: ImportArtifacts, existing: ImportExistingState): ImportPlan {
  const blockers = [...verifyImportManifest(artifacts).errors];
  const conflicts: string[] = [];
  const batchId = artifacts.manifest.importBatchId;
  const confirmedCommands = artifacts.catalog.commands.filter((item) => item.verificationStatus === 'confirmed');
  const eligibleUnits = artifacts.catalog.units.filter((item) => item.verificationStatus === 'confirmed' && item.activationStatus === 'active');
  const commandIds = new Set(confirmedCommands.map((item) => item.id));
  const desiredOrganizations = confirmedCommands.map((item) => commandRecord(item, artifacts.catalog, batchId));
  for (const unit of eligibleUnits) {
    if (!unit.acronym?.trim()) blockers.push(`unit_missing_acronym:${unit.id}`);
    if (!unit.parentCommandId || !commandIds.has(unit.parentCommandId)) blockers.push(`unit_parent_missing:${unit.id}`);
    if (!UNIT_KIND[unit.type]) blockers.push(`unit_type_invalid:${unit.id}`);
    desiredOrganizations.push(unitRecord(unit, artifacts.catalog, batchId));
  }
  const hierarchyErrors = validateUnitHierarchy(desiredOrganizations.map((item) => ({ id: item.id, parentUnitId: item.parentUnitId })));
  blockers.push(...hierarchyErrors.map((error) => `hierarchy:${error}`));
  const existingUnits = new Map(existing.units.map((item) => [item.id, item]));
  const organizationsToCreate: PlannedOrganization[] = [];
  let existingOrganizations = 0;
  for (const desired of desiredOrganizations) {
    const current = existingUnits.get(desired.id);
    if (!current) organizationsToCreate.push(desired);
    else if (same(comparableOrganization(current), comparableOrganization(desired))) existingOrganizations += 1;
    else conflicts.push(`organization_conflict:${desired.id}`);
  }
  const desiredUnits = new Map(desiredOrganizations.filter((item) => item.parentUnitId).map((item) => [item.id, item]));
  const existingEquipment = new Map(existing.equipment.map((item) => [item.patrimony, item]));
  const equipmentToCreate: PlannedEquipment[] = [];
  let existingEquipmentCount = 0;
  for (const generated of artifacts.equipment.equipment) {
    const desiredUnit = desiredUnits.get(generated.unit.id);
    if (!desiredUnit) { blockers.push(`equipment_unit_missing:${generated.patrimony}`); continue; }
    if (!VALID_SITUATIONS.has(generated.situation)) { blockers.push(`equipment_situation_invalid:${generated.patrimony}`); continue; }
    if (!generated.provenance.synthetic || generated.provenance.importBatchId !== batchId) { blockers.push(`equipment_provenance_invalid:${generated.patrimony}`); continue; }
    const planned: PlannedEquipment = { generatedId: generated.id, patrimony: generated.patrimony, type: generated.type, category: generated.category, model: generated.model, brand: generated.brand, situation: generated.situation, location: generated.location, unit: generated.unit, custody: { scope: 'UNIT', unit: generated.unit }, provenance: generated.provenance, history: [] };
    const current = existingEquipment.get(planned.patrimony);
    if (!current) equipmentToCreate.push(planned);
    else if (same(comparableEquipment(current), comparableEquipment(planned))) existingEquipmentCount += 1;
    else conflicts.push(`patrimony_conflict:${planned.patrimony}`);
  }
  const allBlockers = [...new Set([...blockers, ...conflicts])];
  return { batchId, canApply: allBlockers.length === 0, blockers: allBlockers, organizationsToCreate, equipmentToCreate: allBlockers.length ? [] : equipmentToCreate, existingOrganizations, existingEquipment: existingEquipmentCount, conflicts, totals: { commands: confirmedCommands.length, units: eligibleUnits.length, equipment: artifacts.equipment.equipment.length } };
}

export function buildRollbackPlan(input: RollbackInput): RollbackPlan {
  const blockers: string[] = [];
  const equipmentToDelete = input.equipment.filter((item) => item.importBatchId === input.batchId).map((item) => item.patrimony).sort();
  const unitsToDelete = input.units.filter((item) => item.importBatchId === input.batchId).map((item) => item.id).sort();
  if (input.equipment.some((item) => item.importBatchId !== input.batchId)) blockers.push('rollback_contains_preexisting_equipment');
  if (input.units.some((item) => item.importBatchId !== input.batchId)) blockers.push('rollback_contains_preexisting_units');
  for (const dependency of input.dependencies) if (unitsToDelete.includes(dependency.unitId ?? '')) blockers.push(`rollback_dependency:${dependency.type}:${dependency.id}`);
  return { batchId: input.batchId, canApply: blockers.length === 0, blockers: [...new Set(blockers)], conflicts: [], equipmentToDelete, unitsToDelete };
}

export type RollbackTransaction = ImportTransaction;
export type RollbackAdapter = ImportAdapter;

export async function applyRollbackPlan(plan: RollbackPlan, adapter: RollbackAdapter, authorization: { authorized: boolean }): Promise<{ equipment: number; organizations: number }> {
  if (!authorization.authorized) throw new Error('explicit_rollback_authorization_required');
  if (!plan.canApply) throw new Error('rollback_plan_blocked');
  await adapter.transaction(async (transaction) => {
    await transaction.deleteEquipment(plan.equipmentToDelete, plan.batchId);
    await transaction.deleteOrganizations(plan.unitsToDelete, plan.batchId);
  });
  return { equipment: plan.equipmentToDelete.length, organizations: plan.unitsToDelete.length };
}

export function validateMongoDestination(uri: string): { valid: boolean; reason?: string; host?: string; database?: string } {
  return validateLocalMongoDestination(uri, { requireReplicaSet: 'rs0', requireDirectConnection: true });
}

export interface ImportTransaction { insertOrganizations(records: PlannedOrganization[]): Promise<void>; insertEquipment(records: PlannedEquipment[]): Promise<void>; deleteEquipment(patrimonies: string[], batchId: string): Promise<void>; deleteOrganizations(ids: string[], batchId: string): Promise<void> }
export interface ImportAdapter { transaction<T>(work: (transaction: ImportTransaction) => Promise<T>): Promise<T> }
export interface ApplyAuthorization { destinationUri: string; authorized: boolean; backupConfirmed: boolean; backupId?: string }

export async function applyImportPlan(plan: ImportPlan, adapter: ImportAdapter, authorization: ApplyAuthorization): Promise<{ organizations: number; equipment: number }> {
  if (!authorization.authorized) throw new Error('explicit_authorization_required');
  if (!authorization.backupConfirmed || !authorization.backupId) throw new Error('confirmed_backup_required');
  const destination = validateMongoDestination(authorization.destinationUri);
  if (!destination.valid) throw new Error(`unsafe_destination:${destination.reason}`);
  if (!plan.canApply) throw new Error('import_plan_blocked');
  await adapter.transaction(async (transaction) => {
    await transaction.insertOrganizations(plan.organizationsToCreate);
    await transaction.insertEquipment(plan.equipmentToCreate);
  });
  return { organizations: plan.organizationsToCreate.length, equipment: plan.equipmentToCreate.length };
}
