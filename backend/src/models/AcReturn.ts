import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { createHash } from 'node:crypto';

import { isValidUnitReference, type UnitReference } from './User.js';
import { isValidEquipmentCustody, type EquipmentCustody, type EquipmentSituation } from './Equipment.js';

export const AC_RETURN_STATUSES = ['Pendente', 'Aceita', 'Aguardando recebimento', 'Recebida', 'Divergência', 'Rejeitada', 'Cancelada'] as const;
export type AcReturnStatus = typeof AC_RETURN_STATUSES[number];
export const AC_RETURN_ACTIVE_STATUSES = ['Pendente', 'Aguardando recebimento', 'Divergência'] as const;
export type AcReturnDivergenceResolutionStatus = 'pending' | 'resolved';
export interface AcReturnDivergence { description: string; reportedBy: string; reportedAt: Date; resolutionStatus: AcReturnDivergenceResolutionStatus; resolvedBy?: string | null; resolvedAt?: Date | null; resolution?: string | null }
export const AC_RETURNABLE_SITUATIONS = ['active', 'maintenance'] as const satisfies EquipmentSituation[];

const MAX_REASON_LENGTH = 500;

export interface AcReturnEquipmentSnapshot {
  patrimony: string;
  type: string;
  model: string;
  brand: string;
  serialNumber?: string;
  situation: EquipmentSituation;
  unit: UnitReference;
  custody: EquipmentCustody | null;
  equipmentUpdatedAt: string | Date;
  equipmentVersion: number;
}

export interface AcReturnRequestInput {
  equipmentId: string;
  reason?: string;
}

export interface ValidatedAcReturnRequest {
  equipmentId: string;
  reason?: string;
}

export class AcReturnValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcReturnValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalReason(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new AcReturnValidationError('Justificativa inválida.');
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_REASON_LENGTH) throw new AcReturnValidationError('Justificativa inválida.');
  return normalized;
}

export function validateAcReturnRequest(value: unknown): ValidatedAcReturnRequest {
  if (!isRecord(value) || typeof value.equipmentId !== 'string' || !mongoose.isValidObjectId(value.equipmentId.trim())) {
    throw new AcReturnValidationError('Equipamento inválido.');
  }
  return { equipmentId: value.equipmentId.trim(), ...(optionalReason(value.reason) ? { reason: optionalReason(value.reason) } : {}) };
}

export function fingerprintAcReturnRequest(value: AcReturnRequestInput | ValidatedAcReturnRequest): string {
  const input = validateAcReturnRequest(value);
  return createHash('sha256').update(JSON.stringify({ equipmentId: input.equipmentId, reason: input.reason ?? null })).digest('hex');
}

const unitReferenceSchema = new Schema<UnitReference>({ id: { type: String, required: true }, name: { type: String, required: true }, acronym: { type: String, required: true } }, { _id: false });
const custodySchema = new Schema<EquipmentCustody>({ scope: { type: String, required: true, enum: ['AC', 'UNIT'] }, unit: { type: unitReferenceSchema, default: null } }, { _id: false });
const snapshotSchema = new Schema<AcReturnEquipmentSnapshot>({
  patrimony: { type: String, required: true }, type: { type: String, required: true }, model: { type: String, required: true }, brand: { type: String, required: true }, serialNumber: { type: String }, situation: { type: String, required: true, enum: ['active', 'maintenance', 'inactive', 'lost', 'written_off'] }, unit: { type: unitReferenceSchema, required: true }, custody: { type: custodySchema, default: null }, equipmentUpdatedAt: { type: Date, required: true }, equipmentVersion: { type: Number, required: true, min: 0 },
}, { _id: false });
const divergenceSchema = new Schema<AcReturnDivergence>({ description: { type: String, required: true, trim: true, maxlength: 1000 }, reportedBy: { type: String, required: true }, reportedAt: { type: Date, required: true }, resolutionStatus: { type: String, required: true, enum: ['pending', 'resolved'], default: 'pending' }, resolvedBy: { type: String, default: null }, resolvedAt: { type: Date, default: null }, resolution: { type: String, trim: true, maxlength: 1000, default: null } }, { _id: false });

const acReturnSchema = new Schema({
  equipmentId: { type: String, required: true, trim: true },
  origin: { type: unitReferenceSchema, required: true },
  requestedBy: { type: String, required: true, trim: true },
  requestReason: { type: String, trim: true, maxlength: MAX_REASON_LENGTH, default: null },
  status: { type: String, required: true, enum: AC_RETURN_STATUSES, default: 'Pendente' },
  decisionReason: { type: String, trim: true, maxlength: MAX_REASON_LENGTH, default: null },
  decidedBy: { type: String, trim: true, default: null },
  decidedAt: { type: Date, default: null },
  cancelledBy: { type: String, default: null },
  cancelledAt: { type: Date, default: null },
  divergences: { type: [divergenceSchema], default: [] },
  equipment: { type: snapshotSchema, required: true },
  idempotencyKey: { type: String, required: true, trim: true, immutable: true },
  fingerprint: { type: String, required: true, trim: true, immutable: true },
}, { timestamps: true, optimisticConcurrency: true });

acReturnSchema.index({ idempotencyKey: 1 }, { unique: true });
acReturnSchema.index({ equipmentId: 1, status: 1 });
acReturnSchema.index({ 'origin.id': 1, createdAt: -1, _id: 1 });

export type AcReturnDocument = InferSchemaType<typeof acReturnSchema>;
type AcReturnModelType = Model<AcReturnDocument>;

export const AcReturnModel = (mongoose.models.AcReturn as AcReturnModelType | undefined)
  ?? mongoose.model<AcReturnDocument>('AcReturn', acReturnSchema);

export function isValidAcReturnSnapshot(snapshot: unknown): snapshot is AcReturnEquipmentSnapshot {
  if (!isRecord(snapshot) || !isValidUnitReference(snapshot.unit) || !isValidEquipmentCustody(snapshot.custody) && snapshot.custody !== null) return false;
  return typeof snapshot.patrimony === 'string' && typeof snapshot.type === 'string' && typeof snapshot.model === 'string' && typeof snapshot.brand === 'string' && typeof snapshot.equipmentVersion === 'number' && Number.isInteger(snapshot.equipmentVersion) && snapshot.equipmentVersion >= 0;
}
