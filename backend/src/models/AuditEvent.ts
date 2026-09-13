import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import type { UnitReference, UserRole } from './User.js';

export type AuditResult = 'success' | 'failure';
export type AuditFailureReason =
  | 'missing_cookie'
  | 'invalid_cookie'
  | 'revoked_session'
  | 'inactive_user'
  | 'expired_session'
  | 'idle_timeout'
  | 'rate_limited';

export interface AuditActor {
  id: string;
  name?: string;
  registration?: string;
  role?: UserRole;
}

export interface AuditEntity {
  type: string;
  id: string;
  label?: string;
}

export const AUDIT_RETENTION_YEARS = 6;

export function auditRetentionExpiresAt(from = new Date()): Date {
  const date = new Date(from);
  date.setUTCFullYear(date.getUTCFullYear() + AUDIT_RETENTION_YEARS);
  return date;
}

const auditActorSchema = new Schema<AuditActor>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
    registration: { type: String, trim: true },
    role: { type: String, enum: ['ditel_admin', 'unit_user'] satisfies UserRole[] },
  },
  { _id: false },
);

const auditEntitySchema = new Schema<AuditEntity>(
  {
    type: { type: String, required: true, trim: true },
    id: { type: String, required: true, trim: true },
    label: { type: String, trim: true },
  },
  { _id: false },
);

const unitReferenceSchema = new Schema<UnitReference>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    acronym: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const auditEventSchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true },
    userId: { type: String, default: null, trim: true },
    actor: { type: auditActorSchema, default: null },
    entity: { type: auditEntitySchema, default: null },
    unit: { type: unitReferenceSchema, default: null },
    result: {
      type: String,
      required: true,
      enum: ['success', 'failure'] satisfies AuditResult[],
    },
    reason: {
      type: String,
      default: null,
      enum: [
        'missing_cookie',
        'invalid_cookie',
        'revoked_session',
        'inactive_user',
        'expired_session',
        'idle_timeout',
        'rate_limited',
      ] satisfies AuditFailureReason[],
    },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    idempotencyKey: { type: String, default: null, trim: true },
    retentionExpiresAt: { type: Date, required: true, default: () => auditRetentionExpiresAt() },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

auditEventSchema.index({ createdAt: -1, _id: -1 });
auditEventSchema.index({ module: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });
auditEventSchema.index({ userId: 1, createdAt: -1 });
auditEventSchema.index({ result: 1, createdAt: -1 });
auditEventSchema.index({ 'unit.id': 1, createdAt: -1 });
auditEventSchema.index({ 'entity.type': 1, 'entity.id': 1, createdAt: -1 });
auditEventSchema.index({ retentionExpiresAt: 1 });
auditEventSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

export type AuditEventDocument = InferSchemaType<typeof auditEventSchema>;
type AuditEventModelType = Model<AuditEventDocument>;

export const AuditEventModel = (mongoose.models.AuditEvent as AuditEventModelType | undefined)
  ?? mongoose.model<AuditEventDocument>('AuditEvent', auditEventSchema);
