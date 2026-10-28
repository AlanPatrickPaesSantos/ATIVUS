import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, lstat } from 'node:fs/promises';
import path from 'node:path';

import type { UnitReference, UserRole } from '../models/User.js';
import { hashPassword } from '../models/passwordHash.js';
import { validateLocalMongoDestination } from './localMongoDestination.js';

const EXPECTED_ELIGIBLE_UNIT_COUNT = 81;
const PLAN_VERSION = 'pmpa-demonstrative-users-v1';

export interface DemonstrativeCatalogUnit extends UnitReference {
  verificationStatus: string;
  activationStatus: string;
  kind?: string;
}

export interface DemonstrativeCatalog {
  catalogVersion: string;
  patrimonialImportBatchId: string;
  units: DemonstrativeCatalogUnit[];
}

export interface ExistingDemonstrativeUser {
  registration: string;
  role: UserRole;
  unitId: string | null;
  provisioningBatchId: string | null;
}

export interface PlannedDemonstrativeUser {
  registration: string;
  name: string;
  role: 'unit_user';
  unit: UnitReference;
  situation: 'active';
  mustChangePassword: true;
  provisioning: { batchId: string; kind: 'pmpa-demonstrative-user' };
}

export interface DemonstrativeUsersPlan {
  batchId: string;
  catalogVersion: string;
  patrimonialImportBatchId: string;
  canApply: boolean;
  blockers: string[];
  conflicts: string[];
  creates: PlannedDemonstrativeUser[];
  existing: PlannedDemonstrativeUser[];
}

export interface DemonstrativeUserCreateRecord extends PlannedDemonstrativeUser {
  password: string;
}

export interface DemonstrativeUserPersistenceRecord extends PlannedDemonstrativeUser {
  passwordHash: string;
}

export interface DemonstrativeUsersProgressEvent {
  stage: 'credentials_generated' | 'credentials_encrypted' | 'password_hashing_started' | 'password_hashing_completed' | 'transaction_started' | 'transaction_completed' | 'transaction_opened' | 'audit_collection_ready' | 'users_insert_started' | 'users_insert_completed' | 'audit_started' | 'audit_event_started' | 'audit_completed' | 'transaction_committed';
  count?: number;
  eventIndex?: number;
}

export type DemonstrativeUsersDiagnosticCode = 'validation_failed' | 'duplicate_key' | 'transaction_failed' | 'audit_collection_unavailable' | 'audit_validation_failed' | 'audit_duplicate_key' | 'audit_write_failed';

export interface DemonstrativeUsersAdapter {
  transaction(records: DemonstrativeUserPersistenceRecord[]): Promise<void>;
}

export interface DemonstrativeUsersApplyAuthorization {
  authorized: boolean;
  backupConfirmed: boolean;
  backupId?: string;
  destinationUri: string;
  confirmBatch: string;
  ageRecipient: string;
  credentialOutputPath: string;
  deliverCredentials?: (batchId: string, records: CredentialDeliveryRecord[]) => Promise<void>;
  passwordGenerator?: () => string;
  passwordHasher?: (password: string) => Promise<string>;
  onProgress?: (event: DemonstrativeUsersProgressEvent) => void;
  shouldAbort?: () => boolean;
}

export class DemonstrativeUsersApplyError extends Error {
  readonly code = 'TRANSACTION_FAILED_AFTER_CREDENTIAL_ARTIFACT';
  readonly credentialArtifactPath: string;
  readonly diagnosticCode: DemonstrativeUsersDiagnosticCode;
  readonly diagnosticOperation: string;
  readonly diagnosticField: string | null;
  readonly diagnosticEventIndex: number | null;
  readonly diagnosticMongoCode: number | null;
  readonly diagnosticErrorName: string;
  readonly diagnosticCauseName: string | null;
  readonly diagnosticIndexName: string | null;

  constructor(credentialArtifactPath: string, diagnosticCode: DemonstrativeUsersDiagnosticCode, diagnosticOperation = 'transaction', diagnosticField: string | null = null, diagnosticEventIndex: number | null = null, diagnosticMongoCode: number | null = null, diagnosticErrorName = 'Error', diagnosticCauseName: string | null = null, diagnosticIndexName: string | null = null) {
    super('A transação falhou após a criação do artefato criptografado; preserve o arquivo e verifique o banco antes de tentar novamente.');
    this.name = 'DemonstrativeUsersApplyError';
    this.credentialArtifactPath = credentialArtifactPath;
    this.diagnosticCode = diagnosticCode;
    this.diagnosticOperation = diagnosticOperation;
    this.diagnosticField = diagnosticField;
    this.diagnosticEventIndex = diagnosticEventIndex;
    this.diagnosticMongoCode = diagnosticMongoCode;
    this.diagnosticErrorName = diagnosticErrorName;
    this.diagnosticCauseName = diagnosticCauseName;
    this.diagnosticIndexName = diagnosticIndexName;
  }
}

function classifyPersistenceFailure(error: unknown): { code: DemonstrativeUsersDiagnosticCode; operation: string; field: string | null; eventIndex: number | null; mongoCode: number | null; errorName: string; causeName: string | null; indexName: string | null } {
  if (error && typeof error === 'object' && (error as { name?: unknown }).name === 'AuditPersistenceError') {
    const auditError = error as { diagnosticCode?: string; operation?: string; field?: string | null; eventIndex?: number | null; mongoCode?: number | null; errorName?: string; causeName?: string | null; indexName?: string | null };
    const codeMap: Record<string, DemonstrativeUsersDiagnosticCode> = {
      collection_unavailable: 'audit_collection_unavailable',
      validation_failed: 'audit_validation_failed',
      duplicate_key: 'audit_duplicate_key',
      write_failed: 'audit_write_failed',
    };
    return { code: codeMap[auditError.diagnosticCode ?? ''] ?? 'audit_write_failed', operation: auditError.operation ?? 'audit.create', field: auditError.field ?? null, eventIndex: auditError.eventIndex ?? null, mongoCode: auditError.mongoCode ?? null, errorName: auditError.errorName ?? 'Error', causeName: auditError.causeName ?? null, indexName: auditError.indexName ?? null };
  }
  if (error instanceof Error && error.name === 'ValidationError') return { code: 'validation_failed', operation: 'user.insert', field: null, eventIndex: null, mongoCode: null, errorName: error.name, causeName: null, indexName: null };
  if (Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 11000)) return { code: 'duplicate_key', operation: 'user.insert', field: null, eventIndex: null, mongoCode: 11000, errorName: error instanceof Error ? error.name : 'UnknownError', causeName: null, indexName: null };
  return { code: 'transaction_failed', operation: 'transaction', field: null, eventIndex: null, mongoCode: null, errorName: error instanceof Error ? error.name : 'UnknownError', causeName: null, indexName: null };
}

export function computeDemonstrativeUsersBatchId(catalogVersion: string, unitIds: string[]): string {
  const canonical = `${PLAN_VERSION}\n${catalogVersion}\n${[...unitIds].sort().join('\n')}`;
  return `demo-users-${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16)}`;
}

export function generateInitialPassword(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function prepareDemonstrativeUserPersistenceRecords(
  records: DemonstrativeUserCreateRecord[],
  passwordHasher: (password: string) => Promise<string> = hashPassword,
): Promise<DemonstrativeUserPersistenceRecord[]> {
  return Promise.all(records.map(async ({ password, ...record }) => ({
    ...record,
    passwordHash: await passwordHasher(password),
  })));
}

export function buildAgeEncryptionArguments(recipient: string, outputPath: string): string[] {
  return ['-r', recipient, '-o', outputPath];
}

export function validateDemonstrativeUsersDestination(uri: string): { valid: boolean; reason?: string } {
  return validateLocalMongoDestination(uri, { requireDirectConnection: true, requireReplicaSet: 'rs0' });
}

export function validatePersistedEligibleUnits(
  catalogUnits: DemonstrativeCatalogUnit[],
  persistedUnits: UnitReference[],
): string[] {
  const eligible = catalogUnits.filter((unit) => unit.verificationStatus === 'confirmed' && unit.activationStatus === 'active' && unit.kind !== 'intermediate_command');
  const persistedById = new Map(persistedUnits.map((unit) => [unit.id, unit]));
  return eligible.flatMap((unit) => {
    const persisted = persistedById.get(unit.id);
    if (!persisted) return [`unit_missing:${unit.id}`];
    return persisted.name !== unit.name || persisted.acronym !== unit.acronym ? [`unit_metadata_mismatch:${unit.id}`] : [];
  });
}

export interface CredentialDeliveryRecord {
  registration: string;
  unit: UnitReference;
  password: string;
}

export function formatCredentialDeliveryPayload(batchId: string, records: CredentialDeliveryRecord[]): string {
  return `${JSON.stringify({ batchId, credentials: records }, null, 2)}\n`;
}

async function assertCredentialOutputAvailable(outputPath: string): Promise<void> {
  try {
    const existing = await lstat(outputPath);
    if (existing.isDirectory() || existing.isSymbolicLink()) throw new Error('credential_output_not_available');
    throw new Error('credential_output_already_exists');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('credential_output_')) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('credential_output_not_available');
  }
}

export async function encryptCredentialDelivery(
  batchId: string,
  records: CredentialDeliveryRecord[],
  recipient: string,
  outputPath: string,
  ageExecutable = 'age',
): Promise<void> {
  if (!/^age1[0-9a-z]+$/.test(recipient)) throw new Error('valid_age_recipient_required');
  if (!path.isAbsolute(outputPath)) throw new Error('absolute_credential_output_required');
  await assertCredentialOutputAvailable(outputPath);
  const child = spawn(ageExecutable, buildAgeEncryptionArguments(recipient, outputPath), { stdio: ['pipe', 'ignore', 'pipe'], shell: false });
  const result = await new Promise<void>((resolve, reject) => {
    let error = '';
    child.stderr.on('data', (chunk: Buffer) => { error += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`age_failed:${code}:${error.slice(0, 200)}`)));
    child.stdin.end(formatCredentialDeliveryPayload(batchId, records), 'utf8');
  });
  await chmod(outputPath, 0o600);
  return result;
}

function assertApplyAuthorization(plan: DemonstrativeUsersPlan, authorization: DemonstrativeUsersApplyAuthorization): void {
  if (!authorization.authorized) throw new Error('explicit_authorization_required');
  if (!authorization.backupConfirmed || !authorization.backupId) throw new Error('confirmed_backup_required');
  if (authorization.confirmBatch !== plan.batchId) throw new Error('batch_confirmation_mismatch');
  if (!/^age1[0-9a-z]+$/.test(authorization.ageRecipient)) throw new Error('valid_age_recipient_required');
  if (!path.isAbsolute(authorization.credentialOutputPath)) throw new Error('absolute_credential_output_required');
  const relativeOutput = path.relative(process.cwd(), authorization.credentialOutputPath);
  if (relativeOutput === '' || (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput))) throw new Error('credential_output_must_be_outside_repository');
  if (validateDemonstrativeUsersDestination(authorization.destinationUri).valid !== true) throw new Error('unsafe_destination');
  if (!plan.canApply) throw new Error('demonstrative_users_plan_blocked');
  if (!authorization.deliverCredentials) throw new Error('encrypted_credential_delivery_required');
}

export async function applyDemonstrativeUsersPlan(
  plan: DemonstrativeUsersPlan,
  adapter: DemonstrativeUsersAdapter,
  authorization: DemonstrativeUsersApplyAuthorization,
): Promise<{ created: number; credentialCount: number }> {
  assertApplyAuthorization(plan, authorization);
  const deliverCredentials = authorization.deliverCredentials;
  if (!deliverCredentials) throw new Error('encrypted_credential_delivery_required');
  const generatePassword = authorization.passwordGenerator ?? generateInitialPassword;
  const records = plan.creates.map((item) => ({ ...item, password: generatePassword() }));
  authorization.onProgress?.({ stage: 'credentials_generated', count: records.length });
  await deliverCredentials(plan.batchId, records.map((record) => ({ registration: record.registration, unit: record.unit, password: record.password })));
  authorization.onProgress?.({ stage: 'credentials_encrypted', count: records.length });
  if (authorization.shouldAbort?.()) throw new Error('provisioning_interrupted_before_transaction');
  authorization.onProgress?.({ stage: 'password_hashing_started', count: records.length });
  const persistenceRecords = await prepareDemonstrativeUserPersistenceRecords(records, authorization.passwordHasher);
  authorization.onProgress?.({ stage: 'password_hashing_completed', count: persistenceRecords.length });
  if (authorization.shouldAbort?.()) throw new Error('provisioning_interrupted_before_transaction');
  authorization.onProgress?.({ stage: 'transaction_started', count: persistenceRecords.length });
  try {
    await adapter.transaction(persistenceRecords);
  } catch (error) {
    const diagnostic = classifyPersistenceFailure(error);
    throw new DemonstrativeUsersApplyError(authorization.credentialOutputPath, diagnostic.code, diagnostic.operation, diagnostic.field, diagnostic.eventIndex, diagnostic.mongoCode, diagnostic.errorName, diagnostic.causeName, diagnostic.indexName);
  }
  authorization.onProgress?.({ stage: 'transaction_completed', count: persistenceRecords.length });
  return { created: records.length, credentialCount: records.length };
}

function registrationForUnit(unitId: string): string {
  const stableSlug = unitId.replace(/^pmpa:unit:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = crypto.createHash('sha256').update(unitId, 'utf8').digest('hex').slice(0, 4);
  return `demo.unit.${stableSlug}-${suffix}`;
}

function desiredUser(unit: DemonstrativeCatalogUnit, batchId: string): PlannedDemonstrativeUser {
  return {
    registration: registrationForUnit(unit.id),
    name: `Usuário demonstrativo — ${unit.name}`,
    role: 'unit_user',
    unit: { id: unit.id, name: unit.name, acronym: unit.acronym },
    situation: 'active',
    mustChangePassword: true,
    provisioning: { batchId, kind: 'pmpa-demonstrative-user' },
  };
}

export function buildDemonstrativeUsersPlan(
  catalog: DemonstrativeCatalog,
  existingUsers: ExistingDemonstrativeUser[],
): DemonstrativeUsersPlan {
  const eligible = catalog.units
    .filter((unit) => unit.verificationStatus === 'confirmed' && unit.activationStatus === 'active' && unit.kind !== 'intermediate_command')
    .sort((left, right) => left.id.localeCompare(right.id));
  const batchId = computeDemonstrativeUsersBatchId(catalog.catalogVersion, eligible.map((unit) => unit.id));
  const blockers: string[] = [];
  const conflicts: string[] = [];
  const creates: PlannedDemonstrativeUser[] = [];
  const existing: PlannedDemonstrativeUser[] = [];

  if (eligible.length !== EXPECTED_ELIGIBLE_UNIT_COUNT) {
    blockers.push(`eligible_unit_count_mismatch:expected_${EXPECTED_ELIGIBLE_UNIT_COUNT}:actual_${eligible.length}`);
  }

  const desired = eligible.map((unit) => desiredUser(unit, batchId));
  const usersByRegistration = new Map(existingUsers.map((user) => [user.registration, user]));
  for (const item of desired) {
    const current = usersByRegistration.get(item.registration);
    if (!current) {
      creates.push(item);
      continue;
    }
    if (current.role === 'unit_user' && current.unitId === item.unit.id && current.provisioningBatchId === batchId) {
      existing.push(item);
      continue;
    }
    conflicts.push(`registration_conflict:${item.registration}`);
  }

  const unique = <T>(values: T[]) => [...new Set(values)];
  const allBlockers = unique([...blockers, ...conflicts]);
  return {
    batchId,
    catalogVersion: catalog.catalogVersion,
    patrimonialImportBatchId: catalog.patrimonialImportBatchId,
    canApply: allBlockers.length === 0,
    blockers: unique(blockers),
    conflicts: unique(conflicts),
    creates: allBlockers.length ? [] : creates,
    existing,
  };
}
