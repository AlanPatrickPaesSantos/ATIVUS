import {
  auditRetentionExpiresAt,
  AuditEventModel,
  type AuditActor,
  type AuditEntity,
  type AuditFailureReason,
  type AuditResult,
} from '../models/AuditEvent.js';
import type { UnitReference } from '../models/User.js';
import type { ClientSession } from 'mongoose';

export interface RecordAuditEventInput {
  action: string;
  module?: string;
  userId?: string | null;
  actor?: AuditActor | null;
  entity?: AuditEntity | null;
  unit?: UnitReference | null;
  result: AuditResult;
  reason?: AuditFailureReason | null;
  before?: unknown;
  after?: unknown;
  idempotencyKey?: string | null;
  retentionExpiresAt?: Date;
  session?: ClientSession;
}

export interface RecordedAuditEvent {
  id: string;
  action: string;
  module: string;
  userId: string | null;
  actor: AuditActor | null;
  entity: AuditEntity | null;
  unit: UnitReference | null;
  result: AuditResult;
  reason: AuditFailureReason | null;
  before: unknown;
  after: unknown;
  retentionExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEventFilters {
  action?: string;
  module?: string;
  result?: AuditResult;
  userId?: string;
  unitId?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

export class AuditPersistenceError extends Error {
  constructor() {
    super('Não foi possível registrar auditoria.');
    this.name = 'AuditPersistenceError';
  }
}

export function isAuditPersistenceError(error: unknown): error is AuditPersistenceError {
  return error instanceof AuditPersistenceError;
}

function moduleFromAction(action: string): string {
  const prefix = action.split('.')[0] || 'system';
  if (prefix === 'admin') return 'administration';
  if (prefix === 'equipment') return 'inventory';
  return prefix;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function isSensitiveKey(key: string): boolean {
  return /^(password|passwordHash|senha|token|tokens|tokenDigest|sessionId)$/i.test(key);
}

function isSensitiveString(value: string): boolean {
  return /password|senha|tokenDigest|sessionId|token/i.test(value);
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (value instanceof Date) {
    return value;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveKey(key))
        .map(([key, nestedValue]) => [key, sanitizeAuditValue(nestedValue)]),
    );
  }

  if (typeof value === 'string' && isSensitiveString(value)) {
    return '[REDACTED]';
  }

  return value;
}

function sanitizeNullableObject<T>(value: T | null | undefined): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  return sanitizeAuditValue(value) as T;
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

function toRecordedAuditEvent(document: any): RecordedAuditEvent {
  return {
    id: String(document._id ?? document.id),
    action: document.action,
    module: document.module ?? moduleFromAction(document.action),
    userId: document.userId ?? null,
    actor: sanitizeNullableObject(document.actor),
    entity: sanitizeNullableObject(document.entity),
    unit: sanitizeNullableObject(document.unit),
    result: document.result,
    reason: document.reason ?? null,
    before: sanitizeAuditValue(document.before ?? null),
    after: sanitizeAuditValue(document.after ?? null),
    retentionExpiresAt: document.retentionExpiresAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<RecordedAuditEvent> {
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  try {
    const [event] = await AuditEventModel.create([{
      action: input.action,
      module: input.module ?? moduleFromAction(input.action),
      userId: input.userId ?? null,
      actor: sanitizeNullableObject(input.actor),
      entity: sanitizeNullableObject(input.entity),
      unit: sanitizeNullableObject(input.unit),
      result: input.result,
      reason: input.reason ?? null,
      before: sanitizeAuditValue(input.before ?? null),
      after: sanitizeAuditValue(input.after ?? null),
      idempotencyKey,
      retentionExpiresAt: input.retentionExpiresAt ?? auditRetentionExpiresAt(),
    }], input.session ? { session: input.session } : undefined);

    return toRecordedAuditEvent(event.toObject());
  } catch (error) {
    if (idempotencyKey && isDuplicateKeyError(error)) {
      const existing = await AuditEventModel.findOne({ idempotencyKey }).lean().exec();
      if (existing) return toRecordedAuditEvent(existing);
    }
    throw new AuditPersistenceError();
  }
}

export async function listAuditEvents(filters: AuditEventFilters, page: number, pageSize: number) {
  const query: Record<string, unknown> = {};
  if (filters.action) query.action = filters.action;
  if (filters.module) query.module = filters.module;
  if (filters.result) query.result = filters.result;
  if (filters.userId) query.userId = filters.userId;
  if (filters.unitId) query['unit.id'] = filters.unitId;
  if (filters.entityType) query['entity.type'] = filters.entityType;
  if (filters.entityId) query['entity.id'] = filters.entityId;
  if (filters.from || filters.to) {
    query.createdAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }

  const [total, events] = await Promise.all([
    AuditEventModel.countDocuments(query).exec(),
    AuditEventModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .exec(),
  ]);

  return { items: events.map(toRecordedAuditEvent), total, page, pageSize };
}
