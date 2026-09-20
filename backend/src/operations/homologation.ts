import mongoose, { type Model } from 'mongoose';
import { pathToFileURL } from 'node:url';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { readDatabaseReadiness } from '../database/mongoose.js';
import { runInTransaction } from '../database/transaction.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { EquipmentTypeModel } from '../models/EquipmentType.js';
import { MissionModel } from '../models/Mission.js';
import { hashPassword } from '../models/passwordHash.js';
import { LoginRateLimitCounterModel } from '../models/LoginRateLimitCounter.js';
import { MovementModel } from '../models/Movement.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

export interface HomologationIndexEntry {
  model: string;
  missing: string[];
}

export interface HomologationReport {
  databaseName: string | null;
  indexesReady: boolean;
  missingIndexes: HomologationIndexEntry[];
  mongo: 'up' | 'down';
  ready: boolean;
  seeded: boolean;
  transactionSupport: 'supported' | 'unsupported';
}

export interface BootstrapHomologationOptions {
  seedNonProd?: boolean;
}

interface HelloResponse {
  msg?: string;
  setName?: string;
}

interface IndexedModel {
  model: Model<any>;
  name: string;
}

const INDEXED_MODELS: IndexedModel[] = [
  { model: AuditEventModel, name: 'AuditEvent' },
  { model: CallModel, name: 'Call' },
  { model: EquipmentModel, name: 'Equipment' },
  { model: EquipmentTypeModel, name: 'EquipmentType' },
  { model: MissionModel, name: 'Mission' },
  { model: LoginRateLimitCounterModel, name: 'LoginRateLimitCounter' },
  { model: MovementModel, name: 'Movement' },
  { model: SessionModel, name: 'Session' },
  { model: UnitModel, name: 'Unit' },
  { model: UserModel, name: 'User' },
];

function normalizeIndexOptions(options: Record<string, unknown>) {
  return {
    expireAfterSeconds: options.expireAfterSeconds ?? null,
    partialFilterExpression: options.partialFilterExpression ?? null,
    unique: options.unique === true,
  };
}

function indexSignature(
  key: Record<string, unknown>,
  options: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    key,
    options: normalizeIndexOptions(options),
  });
}

function schemaIndexSignatures(model: Model<any>): string[] {
  return model.schema.indexes().map(([key, options]) => indexSignature(key, options as Record<string, unknown>));
}

async function collectionExists(model: Model<any>): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) {
    return false;
  }

  const collections = await db.listCollections({ name: model.collection.collectionName }, { nameOnly: true }).toArray();
  return collections.length > 0;
}

async function actualIndexSignatures(model: Model<any>): Promise<string[]> {
  if (!(await collectionExists(model))) {
    return [];
  }

  const indexes = await model.collection.indexes();
  return indexes
    .filter((index) => index.name !== '_id_')
    .map((index) => indexSignature(index.key as Record<string, unknown>, index as Record<string, unknown>));
}

export function supportsTransactions(hello: HelloResponse | null | undefined): boolean {
  if (!hello) {
    return false;
  }

  return typeof hello.setName === 'string' || hello.msg === 'isdbgrid';
}

async function readHello(): Promise<HelloResponse | null> {
  const db = mongoose.connection.db;
  if (!db) {
    return null;
  }

  return await db.admin().command({ hello: 1 }) as HelloResponse;
}

async function readMissingIndexes(): Promise<HomologationIndexEntry[]> {
  const missingEntries = await Promise.all(INDEXED_MODELS.map(async ({ model, name }) => {
    const expected = schemaIndexSignatures(model);
    const actual = new Set(await actualIndexSignatures(model));
    const missing = expected.filter((signature) => !actual.has(signature));

    return missing.length > 0 ? { model: name, missing } : null;
  }));

  return missingEntries.filter((entry): entry is HomologationIndexEntry => entry !== null);
}

async function ensureOperationalIndexes(): Promise<void> {
  for (const { model } of INDEXED_MODELS) {
    await model.createCollection().catch(() => undefined);
    await model.createIndexes();
  }
}

async function seedNonProductionData(): Promise<void> {
  const seedPassword = process.env.HOMOLOGATION_SEED_PASSWORD;

  if (!seedPassword) {
    throw new Error('HOMOLOGATION_SEED_PASSWORD is required for the non-production seed.');
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error('Non-production seed is forbidden when NODE_ENV=production.');
  }

  const passwordHash = await hashPassword(seedPassword);

  await runInTransaction(async (session) => {
    await UnitModel.updateOne(
      { id: 'hml-unit' },
      {
        $setOnInsert: {
          id: 'hml-unit',
          name: 'Unidade Homologação',
          acronym: 'HML',
          active: true,
        },
      },
      { upsert: true, session },
    );

    await UserModel.collection.updateOne(
      { registration: 'hml-admin' },
      {
        $setOnInsert: {
          name: 'Admin Homologação',
          registration: 'hml-admin',
          role: 'ditel_admin',
          situation: 'active',
          unit: null,
          passwordHash,
        },
      },
      { upsert: true, session },
    );

    await UserModel.collection.updateOne(
      { registration: 'hml-unit' },
      {
        $setOnInsert: {
          name: 'Usuária Homologação',
          registration: 'hml-unit',
          role: 'unit_user',
          situation: 'active',
          unit: {
            id: 'hml-unit',
            name: 'Unidade Homologação',
            acronym: 'HML',
          },
          passwordHash,
        },
      },
      { upsert: true, session },
    );
  });
}

export async function readHomologationReport(): Promise<HomologationReport> {
  const readiness = await readDatabaseReadiness();
  const hello = readiness.ready ? await readHello() : null;
  const missingIndexes = readiness.ready ? await readMissingIndexes() : [];

  return {
    databaseName: mongoose.connection.db?.databaseName ?? null,
    indexesReady: readiness.ready && missingIndexes.length === 0,
    missingIndexes,
    mongo: readiness.mongo,
    ready: readiness.ready,
    seeded: false,
    transactionSupport: supportsTransactions(hello) ? 'supported' : 'unsupported',
  };
}

export async function bootstrapHomologation(
  options: BootstrapHomologationOptions = {},
): Promise<HomologationReport> {
  const report = await readHomologationReport();

  if (!report.ready) {
    throw new Error('MongoDB is not ready for homologation bootstrap.');
  }

  if (report.transactionSupport !== 'supported') {
    throw new Error('MongoDB deployment does not support transactions required by ATIVUS.');
  }

  await ensureOperationalIndexes();

  if (options.seedNonProd) {
    await seedNonProductionData();
  }

  const after = await readHomologationReport();
  return {
    ...after,
    seeded: options.seedNonProd === true,
  };
}

function formatReport(report: HomologationReport): string {
  return [
    '# ATIVUS homologation verify report',
    '',
    `Database: ${report.databaseName ?? 'unavailable'}`,
    `Mongo ready: ${report.ready ? 'yes' : 'no'}`,
    `Transaction support: ${report.transactionSupport}`,
    `Indexes ready: ${report.indexesReady ? 'yes' : 'no'}`,
    `Synthetic seed applied: ${report.seeded ? 'yes' : 'no'}`,
    '',
    '## Missing indexes',
    ...(report.missingIndexes.length === 0
      ? ['- none']
      : report.missingIndexes.map((entry) => `- ${entry.model}: ${entry.missing.length} missing`)),
  ].join('\n');
}

function parseCliArguments(argv: string[]) {
  const command = argv[0] === 'bootstrap' || argv[0] === 'verify' ? argv[0] : 'verify';
  return {
    command,
    seedNonProd: argv.includes('--seed-non-prod'),
  } as const;
}

async function runCli(argv: string[]) {
  const parsed = parseCliArguments(argv);
  await connectToDatabase();

  try {
    const report = parsed.command === 'bootstrap'
      ? await bootstrapHomologation({ seedNonProd: parsed.seedNonProd })
      : await readHomologationReport();

    console.log(formatReport(report));

    if (!report.ready || report.transactionSupport !== 'supported' || !report.indexesReady) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectFromDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error('Failed to run ATIVUS homologation command', error);
    process.exitCode = 1;
  });
}
