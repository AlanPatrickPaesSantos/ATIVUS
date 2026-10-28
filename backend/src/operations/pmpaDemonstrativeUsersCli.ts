import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { UnitModel } from '../models/Unit.js';
import { applyDemonstrativeUsersPlan, buildDemonstrativeUsersPlan, DemonstrativeUsersApplyError, encryptCredentialDelivery, type DemonstrativeCatalog, type DemonstrativeUsersProgressEvent, validateDemonstrativeUsersDestination, validatePersistedEligibleUnits } from './pmpaDemonstrativeUsers.js';
import { createDemonstrativeUsers, deactivateDemonstrativeUsers, ensureDemonstrativeUsersAuditCollection, listUsersForDemonstrativeBatch, listUsersForDemonstrativePlan } from '../repositories/pmpaDemonstrativeUsersRepository.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_CATALOG = path.join(ROOT, 'docs/catalog/pmpa-organizational-catalog.v1.normalized.json');
const PATRIMONIAL_BATCH = 'demo-0e66fd8f9f8078ab';
let interruptionRequested = false;

function assertAgeExecutableAvailable(): void {
  const result = spawnSync('age', ['--version'], { stdio: 'ignore', shell: false });
  if (result.error || result.status !== 0) throw new Error('age_executable_required_before_apply');
}

interface Arguments {
  command: 'dry-run' | 'apply' | 'rollback';
  catalog: string;
  uriEnv: string;
  confirmBatch?: string;
  backupId?: string;
  ageRecipient?: string;
  credentialsOutput?: string;
  batch?: string;
  authorizeApply: boolean;
  authorizeRollback: boolean;
}

function parseArguments(argv: string[]): Arguments {
  const command = (argv[0]?.startsWith('--') ? 'dry-run' : argv[0] ?? 'dry-run') as Arguments['command'];
  if (!['dry-run', 'apply', 'rollback'].includes(command)) throw new Error('invalid_pmpa_users_command');
  const result: Arguments = { command, catalog: DEFAULT_CATALOG, uriEnv: 'MONGODB_URI', authorizeApply: false, authorizeRollback: false };
  for (let index = command === 'dry-run' && argv[0]?.startsWith('--') ? 0 : 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--catalog') result.catalog = path.resolve(argv[++index]);
    else if (argument === '--uri-env') result.uriEnv = argv[++index];
    else if (argument === '--confirm-batch') result.confirmBatch = argv[++index];
    else if (argument === '--backup-id') result.backupId = argv[++index];
    else if (argument === '--age-recipient') result.ageRecipient = argv[++index];
    else if (argument === '--credentials-output') result.credentialsOutput = path.resolve(argv[++index]);
    else if (argument === '--batch') result.batch = argv[++index];
    else if (argument === '--authorize-apply') result.authorizeApply = true;
    else if (argument === '--authorize-rollback') result.authorizeRollback = true;
    else throw new Error(`unknown_pmpa_users_argument:${argument}`);
  }
  return result;
}

async function loadCatalog(file: string): Promise<DemonstrativeCatalog> {
  const parsed = JSON.parse(await readFile(file, 'utf8')) as Omit<DemonstrativeCatalog, 'patrimonialImportBatchId'>;
  return { ...parsed, patrimonialImportBatchId: PATRIMONIAL_BATCH };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const arguments_ = parseArguments(argv);
  const catalog = await loadCatalog(arguments_.catalog);
  const uri = process.env[arguments_.uriEnv];
  if (!uri) throw new Error(`${arguments_.uriEnv}_required_for_unit_confirmation`);
  if (!validateDemonstrativeUsersDestination(uri).valid) throw new Error('unsafe_destination');
  if (arguments_.command === 'apply') assertAgeExecutableAvailable();
  mongoose.set('autoIndex', false);
  await connectToDatabase(uri);
  try {
    const eligible = catalog.units.filter((unit) => unit.verificationStatus === 'confirmed' && unit.activationStatus === 'active' && unit.kind !== 'intermediate_command');
    const persisted = await UnitModel.find({ id: { $in: eligible.map((unit) => unit.id) }, active: true }).select({ _id: 0, id: 1, name: 1, acronym: 1 }).lean().exec();
    const unitBlockers = validatePersistedEligibleUnits(catalog.units, persisted);
    const plan = buildDemonstrativeUsersPlan(catalog, await listUsersForDemonstrativePlan());
    plan.blockers.push(...unitBlockers);
    plan.canApply = plan.blockers.length === 0 && plan.conflicts.length === 0;

    if (arguments_.command === 'dry-run') {
      console.log(JSON.stringify({ mode: 'dry-run', batchId: plan.batchId, patrimonialImportBatchId: PATRIMONIAL_BATCH, eligibleUnits: eligible.length, persistedEligibleUnits: persisted.length, creates: plan.creates.length, existing: plan.existing.length, blockers: [...new Set(plan.blockers)], conflicts: plan.conflicts, writes: 0 }, null, 2));
      return;
    }

    if (arguments_.command === 'apply') {
      if (!arguments_.ageRecipient || !arguments_.credentialsOutput) throw new Error('age_recipient_and_output_required');
      const result = await applyDemonstrativeUsersPlan(plan, { transaction: (records) => createWithAudit(records, emitProgress, () => interruptionRequested) }, {
        authorized: arguments_.authorizeApply,
        backupConfirmed: Boolean(arguments_.backupId),
        backupId: arguments_.backupId,
        destinationUri: uri,
        confirmBatch: arguments_.confirmBatch ?? '',
        ageRecipient: arguments_.ageRecipient,
        credentialOutputPath: arguments_.credentialsOutput,
        deliverCredentials: (batchId, records) => encryptCredentialDelivery(batchId, records, arguments_.ageRecipient!, arguments_.credentialsOutput!),
        onProgress: emitProgress,
        shouldAbort: () => interruptionRequested,
      });
      console.log(JSON.stringify({ mode: 'apply', batchId: plan.batchId, created: result.created, credentialFile: arguments_.credentialsOutput }, null, 2));
      return;
    }

    if (!arguments_.batch) throw new Error('rollback_batch_required');
    const users = await listUsersForDemonstrativeBatch(arguments_.batch);
    if (!arguments_.authorizeRollback) {
      console.log(JSON.stringify({ mode: 'rollback-dry-run', batchId: arguments_.batch, candidates: users.length, active: users.filter((user) => user.situation === 'active').length, writes: 0 }, null, 2));
      return;
    }
    if (arguments_.confirmBatch !== arguments_.batch) throw new Error('batch_confirmation_mismatch');
    const changed = await runRollback(arguments_.batch);
    console.log(JSON.stringify({ mode: 'rollback', batchId: arguments_.batch, deactivated: changed }, null, 2));
  } finally {
    await disconnectFromDatabase();
  }
}

function emitProgress(event: DemonstrativeUsersProgressEvent): void {
  console.error(JSON.stringify({ stage: event.stage, ...(event.count === undefined ? {} : { count: event.count }), ...(event.eventIndex === undefined ? {} : { eventIndex: event.eventIndex }) }));
}

async function createWithAudit(records: Parameters<typeof createDemonstrativeUsers>[0], onProgress: (event: DemonstrativeUsersProgressEvent) => void, shouldAbort: () => boolean): Promise<void> {
  await ensureDemonstrativeUsersAuditCollection();
  onProgress({ stage: 'audit_collection_ready', count: records.length });
  const session = await mongoose.startSession();
  try {
    onProgress({ stage: 'transaction_opened', count: records.length });
    await session.withTransaction(async () => createDemonstrativeUsers(records, session, { onProgress, shouldAbort }));
    onProgress({ stage: 'transaction_committed', count: records.length });
  } finally {
    await session.endSession();
  }
}

async function runRollback(batchId: string): Promise<number> {
  const session = await mongoose.startSession();
  try {
    let changed = 0;
    await session.withTransaction(async () => { changed = await deactivateDemonstrativeUsers(batchId, session); });
    return changed;
  } finally {
    await session.endSession();
  }
}

if (import.meta.main) {
  const handleInterrupt = () => {
    interruptionRequested = true;
    console.error('SIGINT recebido; aguardando a etapa segura para abortar e encerrar a sessão.');
  };
  process.once('SIGINT', handleInterrupt);
  main().catch((error) => {
    if (error instanceof DemonstrativeUsersApplyError) {
      const field = error.diagnosticField ? ` Campo: ${error.diagnosticField}.` : '';
      const eventIndex = error.diagnosticEventIndex === null ? '' : ` Índice do evento: ${error.diagnosticEventIndex}.`;
      const mongoCode = error.diagnosticMongoCode === null ? '' : ` Código Mongo permitido: ${error.diagnosticMongoCode}.`;
      const indexName = error.diagnosticIndexName ? ` Índice: ${error.diagnosticIndexName}.` : '';
      console.error(`${error.message} Código técnico: ${error.diagnosticCode}. Operação: ${error.diagnosticOperation}.${eventIndex}${mongoCode}${indexName} Classe: ${error.diagnosticErrorName}.${error.diagnosticCauseName ? ` Causa: ${error.diagnosticCauseName}.` : ''}${field} Artefato preservado em: ${error.credentialArtifactPath}`);
    } else {
      console.error(error instanceof Error ? error.message : 'ativus_users_failed');
    }
    process.exitCode = interruptionRequested ? 130 : 1;
  }).finally(() => {
    process.removeListener('SIGINT', handleInterrupt);
  });
}
