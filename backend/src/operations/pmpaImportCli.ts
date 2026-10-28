import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { applyImportPlan, applyRollbackPlan, buildImportPlan, buildRollbackPlan, validateMongoDestination, verifyImportManifest, type ImportArtifacts } from './pmpaImport.js';
import { createMongoosePmpaImportAdapter } from './pmpaImportMongoose.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULTS = {
  catalog: path.join(ROOT, 'docs/catalog/pmpa-organizational-catalog.v1.normalized.json'),
  equipment: path.join(ROOT, 'docs/catalog/generated-equipment/equipment.json'),
  manifest: path.join(ROOT, 'docs/catalog/generated-equipment/manifest.json'),
};

interface CliArguments { command: 'dry-run' | 'apply' | 'rollback'; uriEnv: string; confirmBatch?: string; backupId?: string; batch?: string; auditExport?: string; authorizeApply: boolean; authorizeRollback: boolean; execute: boolean; catalog: string; equipment: string; manifest: string }

export function buildRollbackReport(input: { mode: string; batchId: string; blockers: string[]; conflicts: string[]; equipmentToDelete: string[]; unitsToDelete: string[]; result: unknown }) {
  return { mode: input.mode, batchId: input.batchId, quantities: { equipment: input.equipmentToDelete.length, organizations: input.unitsToDelete.length }, blockers: input.blockers, conflicts: input.conflicts, result: input.result ? 'applied' : 'preview_only' };
}

export async function writeRollbackAuditExport(file: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseArguments(argv: string[]): CliArguments {
  const command = (argv[0] && !argv[0].startsWith('--') ? argv[0] : 'dry-run') as CliArguments['command'];
  if (!['dry-run', 'apply', 'rollback'].includes(command)) throw new Error('invalid_import_command');
  const result: CliArguments = { command, uriEnv: 'MONGODB_URI', authorizeApply: false, authorizeRollback: false, execute: false, ...DEFAULTS };
  const start = command === 'dry-run' && argv[0]?.startsWith('--') ? 0 : 1;
  for (let index = start; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--uri-env') result.uriEnv = argv[++index];
    else if (argument === '--confirm-batch') result.confirmBatch = argv[++index];
    else if (argument === '--backup-id') result.backupId = argv[++index];
    else if (argument === '--batch') result.batch = argv[++index];
    else if (argument === '--audit-export') result.auditExport = path.resolve(argv[++index]);
    else if (argument === '--authorize-apply') result.authorizeApply = true;
    else if (argument === '--authorize-rollback') result.authorizeRollback = true;
    else if (argument === '--execute') result.execute = true;
    else if (argument === '--catalog') result.catalog = path.resolve(argv[++index]);
    else if (argument === '--equipment') result.equipment = path.resolve(argv[++index]);
    else if (argument === '--manifest') result.manifest = path.resolve(argv[++index]);
    else throw new Error(`unknown_import_argument:${argument}`);
  }
  if (result.command === 'apply' && (!result.confirmBatch || !result.backupId || !result.authorizeApply)) throw new Error('apply_requires_batch_backup_and_authorization');
  if (result.command === 'rollback' && (!result.batch || !result.authorizeRollback)) throw new Error('rollback_requires_batch_and_authorization');
  return result;
}

async function readArtifacts(arguments_: CliArguments): Promise<ImportArtifacts> {
  const [catalog, equipment, manifest] = await Promise.all([
    readFile(arguments_.catalog, 'utf8').then((value) => JSON.parse(value)),
    readFile(arguments_.equipment, 'utf8').then((value) => JSON.parse(value)),
    readFile(arguments_.manifest, 'utf8').then((value) => JSON.parse(value)),
  ]);
  return { catalog, equipment, manifest } as ImportArtifacts;
}

function reportPlan(plan: ReturnType<typeof buildImportPlan>, mode: string, destination: { host?: string; database?: string }) {
  return { mode, destination, batchId: plan.batchId, canApply: plan.canApply, blockers: plan.blockers, conflicts: plan.conflicts, totals: plan.totals, existingOrganizations: plan.existingOrganizations, existingEquipment: plan.existingEquipment, organizationsToCreate: plan.organizationsToCreate.length, equipmentToCreate: plan.equipmentToCreate.length };
}

async function main(argv: string[]) {
  const arguments_ = parseArguments(argv);
  const uri = process.env[arguments_.uriEnv];
  if (!uri) throw new Error(`${arguments_.uriEnv}_is_required_and_no_env_files_are_loaded`);
  const destination = validateMongoDestination(uri);
  if (!destination.valid) throw new Error(`unsafe_destination:${destination.reason}`);
  const artifacts = await readArtifacts(arguments_);
  const manifestCheck = verifyImportManifest(artifacts);
  if (!manifestCheck.valid) throw new Error(`invalid_manifest:${manifestCheck.errors.join(',')}`);
  mongoose.set('autoIndex', false);
  const adapter = createMongoosePmpaImportAdapter();
  await connectToDatabase(uri);
  try {
    if (arguments_.command === 'rollback') {
      const batchId = arguments_.batch as string;
      const rollback = buildRollbackPlan(await adapter.loadRollbackInput(batchId));
      let operationResult: { equipment: number; organizations: number } | null = null;
      if (arguments_.execute) operationResult = await applyRollbackPlan(rollback, adapter, { authorized: arguments_.authorizeRollback });
      if (arguments_.auditExport) await writeRollbackAuditExport(arguments_.auditExport, { mode: arguments_.execute ? 'rollback-apply' : 'rollback-dry-run', destination: { host: destination.host, database: destination.database }, ...rollback, operationResult });
      console.log(JSON.stringify(buildRollbackReport({ mode: arguments_.execute ? 'rollback-apply' : 'rollback-dry-run', batchId: rollback.batchId, blockers: rollback.blockers, conflicts: rollback.conflicts, equipmentToDelete: rollback.equipmentToDelete, unitsToDelete: rollback.unitsToDelete, result: operationResult }), null, 2));
      return;
    }
    const unitIds = [...artifacts.catalog.commands, ...(artifacts.catalog.pendingCommands ?? []), ...artifacts.catalog.units].map((item) => item.id);
    const patrimonies = artifacts.equipment.equipment.map((item) => item.patrimony);
    const plan = buildImportPlan(artifacts, await adapter.loadExistingState(unitIds, patrimonies));
    const result = reportPlan(plan, arguments_.command, { host: destination.host, database: destination.database });
    if (arguments_.command === 'apply') {
      if (arguments_.confirmBatch !== plan.batchId) throw new Error('confirmed_batch_mismatch');
      Object.assign(result, await applyImportPlan(plan, adapter, { destinationUri: uri, authorized: arguments_.authorizeApply, backupConfirmed: Boolean(arguments_.backupId), backupId: arguments_.backupId }));
    }
    console.log(JSON.stringify(result, null, 2));
    if (!plan.canApply) process.exitCode = 3;
  } finally {
    await disconnectFromDatabase();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 2; });
