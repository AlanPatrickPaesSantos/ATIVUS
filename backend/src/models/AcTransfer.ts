import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { createHash } from 'node:crypto';

import { isValidUnitReference, type UnitReference } from './User.js';
import { isValidEquipmentCustody, type EquipmentCustody } from './Equipment.js';

export const AC_TRANSFER_ORIGIN = 'AC' as const;
export const AC_TRANSFER_STATUSES = ['confirmed'] as const;
export type AcTransferStatus = typeof AC_TRANSFER_STATUSES[number];

const MAX_MATERIALS_PER_TRANSFER = 500;
const MAX_PERSON_NAME_LENGTH = 120;
const MAX_REGISTRATION_LENGTH = 30;
const MAX_BG_NUMBER_LENGTH = 80;
const MAX_PATRIMONY_LENGTH = 80;
const MAX_SERIAL_NUMBER_LENGTH = 120;

export interface AcTransferPerson {
  name: string;
  registration?: string;
}

export interface AcTransferMaterialSnapshot {
  equipmentId: string;
  patrimony: string;
  description?: string;
  identification?: string;
  model?: string;
  serialNumber?: string;
  sourceCustody: EquipmentCustody;
  equipmentUpdatedAt: string | Date;
  equipmentVersion: number;
}

export interface AcTransferInput {
  destinationUnit: UnitReference;
  distributedAt: string | Date;
  deliverer: AcTransferPerson;
  receiver: AcTransferPerson;
  bg?: { number: string } | null;
  materials: AcTransferMaterialSnapshot[];
}

export interface AcTransferRequestInput {
  destinationUnit: UnitReference;
  distributedAt: string | Date;
  deliverer: AcTransferPerson;
  receiver: AcTransferPerson;
  bg?: { number: string } | null;
  equipmentIds: string[];
}

export interface ValidatedAcTransferRequest {
  destinationUnit: UnitReference;
  distributedAt: Date;
  deliverer: AcTransferPerson;
  receiver: AcTransferPerson;
  bg: { number: string } | null;
  equipmentIds: string[];
}

export interface ValidatedAcTransferInput {
  origin: typeof AC_TRANSFER_ORIGIN;
  status: AcTransferStatus;
  destinationUnit: UnitReference;
  distributedAt: Date;
  deliverer: AcTransferPerson;
  receiver: AcTransferPerson;
  bg: { number: string } | null;
  materials: AcTransferMaterialSnapshot[];
}

export class AcTransferValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcTransferValidationError';
  }
}

export type AcTransferReplayResult = 'replay' | 'conflict';

export function classifyAcTransferReplay(existingFingerprint: string, incomingFingerprint: string): AcTransferReplayResult {
  return existingFingerprint === incomingFingerprint ? 'replay' : 'conflict';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new AcTransferValidationError(`${label} é obrigatório.`);
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new AcTransferValidationError(`${label} é inválido.`);
  }

  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return requiredText(value, label, maxLength);
}

function person(value: unknown, label: string): AcTransferPerson {
  if (!isRecord(value)) {
    throw new AcTransferValidationError(`${label} é obrigatório.`);
  }

  const registration = optionalText(value.registration, `${label}.registration`, MAX_REGISTRATION_LENGTH);
  return {
    name: requiredText(value.name, `${label}.name`, MAX_PERSON_NAME_LENGTH),
    ...(registration ? { registration } : {}),
  };
}

export function validateAcTransferInput(value: unknown): ValidatedAcTransferInput {
  if (!isRecord(value)) {
    throw new AcTransferValidationError('Dados da distribuição inválidos.');
  }

  if (!isValidUnitReference(value.destinationUnit)) {
    throw new AcTransferValidationError('Unidade destino inválida.');
  }

  const distributedAt = value.distributedAt instanceof Date
    ? new Date(value.distributedAt.getTime())
    : new Date(typeof value.distributedAt === 'string' ? value.distributedAt : '');
  if (Number.isNaN(distributedAt.getTime())) {
    throw new AcTransferValidationError('Data da distribuição inválida.');
  }

  if (!Array.isArray(value.materials) || value.materials.length === 0) {
    throw new AcTransferValidationError('Pelo menos um bem deve ser distribuído.');
  }
  if (value.materials.length > MAX_MATERIALS_PER_TRANSFER) {
    throw new AcTransferValidationError('A distribuição excede o limite de bens.');
  }

  const equipmentIds = new Set<string>();
  const materials = value.materials.map((material) => {
    if (!isRecord(material) || typeof material.equipmentId !== 'string' || !mongoose.isValidObjectId(material.equipmentId.trim())) {
      throw new AcTransferValidationError('O identificador do bem é inválido.');
    }

    const equipmentId = material.equipmentId.trim();
    if (equipmentIds.has(equipmentId)) {
      throw new AcTransferValidationError('Um bem não pode ser repetido na mesma distribuição.');
    }
    equipmentIds.add(equipmentId);

    const serialNumber = optionalText(material.serialNumber, 'Número de série', MAX_SERIAL_NUMBER_LENGTH);
    if (!isValidEquipmentCustody(material.sourceCustody) || material.sourceCustody.scope !== 'AC' || material.sourceCustody.unit !== null) {
      throw new AcTransferValidationError('A custódia de origem deve ser AC.');
    }
    const equipmentUpdatedAt = material.equipmentUpdatedAt instanceof Date
      ? new Date(material.equipmentUpdatedAt.getTime())
      : new Date(typeof material.equipmentUpdatedAt === 'string' ? material.equipmentUpdatedAt : '');
    if (Number.isNaN(equipmentUpdatedAt.getTime())) {
      throw new AcTransferValidationError('A versão temporal do bem é inválida.');
    }
    const equipmentVersion = material.equipmentVersion;
    if (typeof equipmentVersion !== 'number' || !Number.isInteger(equipmentVersion) || equipmentVersion < 0) {
      throw new AcTransferValidationError('A versão do bem é inválida.');
    }
    return {
      equipmentId,
      patrimony: requiredText(material.patrimony, 'Patrimônio', MAX_PATRIMONY_LENGTH),
      ...(serialNumber ? { serialNumber } : {}),
      sourceCustody: { scope: 'AC' as const, unit: null },
      equipmentUpdatedAt,
      equipmentVersion,
    };
  });

  const bg = value.bg === undefined || value.bg === null
    ? null
    : (() => {
        if (!isRecord(value.bg)) {
          throw new AcTransferValidationError('BG inválido.');
        }
        return { number: requiredText(value.bg.number, 'BG', MAX_BG_NUMBER_LENGTH) };
      })();

  return {
    origin: AC_TRANSFER_ORIGIN,
    status: 'confirmed',
    destinationUnit: value.destinationUnit,
    distributedAt,
    deliverer: person(value.deliverer, 'Entregador'),
    receiver: person(value.receiver, 'Recebedor'),
    bg,
    materials,
  };
}

export function validateAcTransferRequest(value: unknown): ValidatedAcTransferRequest {
  if (!isRecord(value) || !isValidUnitReference(value.destinationUnit)) {
    throw new AcTransferValidationError('Unidade destino inválida.');
  }

  const distributedAt = value.distributedAt instanceof Date
    ? new Date(value.distributedAt.getTime())
    : new Date(typeof value.distributedAt === 'string' ? value.distributedAt : '');
  if (Number.isNaN(distributedAt.getTime())) {
    throw new AcTransferValidationError('Data da distribuição inválida.');
  }

  if (!Array.isArray(value.equipmentIds) || value.equipmentIds.length === 0) {
    throw new AcTransferValidationError('Pelo menos um bem deve ser distribuído.');
  }
  if (value.equipmentIds.length > MAX_MATERIALS_PER_TRANSFER) {
    throw new AcTransferValidationError('A distribuição excede o limite de bens.');
  }

  const equipmentIds = value.equipmentIds.map((id) => {
    if (typeof id !== 'string' || !mongoose.isValidObjectId(id.trim())) {
      throw new AcTransferValidationError('O identificador do bem é inválido.');
    }
    return id.trim();
  });
  if (new Set(equipmentIds).size !== equipmentIds.length) {
    throw new AcTransferValidationError('Um bem não pode ser repetido na mesma distribuição.');
  }

  const bg = value.bg === undefined || value.bg === null
    ? null
    : (() => {
        if (!isRecord(value.bg)) throw new AcTransferValidationError('BG inválido.');
        return { number: requiredText(value.bg.number, 'BG', MAX_BG_NUMBER_LENGTH) };
      })();

  return {
    destinationUnit: value.destinationUnit,
    distributedAt,
    deliverer: person(value.deliverer, 'Entregador'),
    receiver: person(value.receiver, 'Recebedor'),
    bg,
    equipmentIds,
  };
}

export function fingerprintAcTransferRequest(value: AcTransferRequestInput | ValidatedAcTransferRequest): string {
  const input = validateAcTransferRequest(value);
  const canonical = {
    destinationUnit: input.destinationUnit,
    distributedAt: input.distributedAt.toISOString(),
    deliverer: input.deliverer,
    receiver: input.receiver,
    bg: input.bg,
    equipmentIds: [...input.equipmentIds].sort(),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function fingerprintAcTransferPayload(value: AcTransferInput | ValidatedAcTransferInput): string {
  const input = validateAcTransferInput(value);
  const canonical = {
    origin: input.origin,
    destinationUnit: input.destinationUnit,
    distributedAt: input.distributedAt.toISOString(),
    deliverer: input.deliverer,
    receiver: input.receiver,
    bg: input.bg,
    materials: [...input.materials]
      .sort((left, right) => left.equipmentId.localeCompare(right.equipmentId))
      .map((material) => ({
        equipmentId: material.equipmentId,
        patrimony: material.patrimony,
        serialNumber: material.serialNumber ?? null,
        sourceCustody: material.sourceCustody,
        equipmentUpdatedAt: new Date(material.equipmentUpdatedAt).toISOString(),
        equipmentVersion: material.equipmentVersion,
      })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const unitReferenceSchema = new Schema<UnitReference>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    acronym: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const sourceCustodySchema = new Schema<EquipmentCustody>(
  {
    scope: { type: String, required: true, enum: ['AC'] },
    unit: { type: unitReferenceSchema, default: null },
  },
  { _id: false },
);

const personSchema = new Schema<AcTransferPerson>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_PERSON_NAME_LENGTH },
    registration: { type: String, trim: true, maxlength: MAX_REGISTRATION_LENGTH },
  },
  { _id: false },
);

const materialSnapshotSchema = new Schema<AcTransferMaterialSnapshot>(
  {
    equipmentId: { type: String, required: true, trim: true },
    patrimony: { type: String, required: true, trim: true, maxlength: MAX_PATRIMONY_LENGTH },
    description: { type: String, trim: true, maxlength: 160 },
    identification: { type: String, trim: true, maxlength: 160 },
    model: { type: String, trim: true, maxlength: 160 },
    serialNumber: { type: String, trim: true, maxlength: MAX_SERIAL_NUMBER_LENGTH },
    sourceCustody: { type: sourceCustodySchema, required: true },
    equipmentUpdatedAt: { type: Date, required: true },
    equipmentVersion: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const acTransferSchema = new Schema(
  {
    origin: { type: String, required: true, enum: [AC_TRANSFER_ORIGIN], default: AC_TRANSFER_ORIGIN, immutable: true },
    destinationUnit: { type: unitReferenceSchema, required: true },
    distributedAt: { type: Date, required: true },
    deliverer: { type: personSchema, required: true },
    receiver: { type: personSchema, required: true },
    bg: {
      number: { type: String, trim: true, maxlength: MAX_BG_NUMBER_LENGTH },
    },
    materials: { type: [materialSnapshotSchema], required: true, validate: [(items: unknown[]) => items.length > 0, 'Pelo menos um bem deve ser distribuído.'] },
    createdBy: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: AC_TRANSFER_STATUSES, default: 'confirmed', immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, immutable: true },
    fingerprint: { type: String, required: true, trim: true, immutable: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

acTransferSchema.index({ 'materials.equipmentId': 1 });
acTransferSchema.index({ 'destinationUnit.id': 1, distributedAt: -1 });
acTransferSchema.index({ idempotencyKey: 1 }, { unique: true });

acTransferSchema.pre('validate', function validateSnapshotIntegrity(next) {
  for (const material of this.materials ?? []) {
    if (!isValidEquipmentCustody(material.sourceCustody) || material.sourceCustody.scope !== 'AC' || material.sourceCustody.unit !== null) {
      this.invalidate('materials', 'Cada bem deve possuir snapshot de custódia AC.');
      break;
    }
  }
  next();
});

acTransferSchema.pre('save', function rejectExistingSave(next) {
  if (!this.isNew) {
    next(new Error('Transferências AC são somente acrescentadas e não podem ser alteradas.'));
    return;
  }
  next();
});

for (const operation of ['findOneAndUpdate', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany'] as const) {
  acTransferSchema.pre(operation, function rejectMutation() {
    throw new Error('Transferências AC são somente acrescentadas e não podem ser alteradas ou excluídas.');
  });
}

export type AcTransferDocument = InferSchemaType<typeof acTransferSchema>;
type AcTransferModelType = Model<AcTransferDocument>;

export const AcTransferModel = (mongoose.models.AcTransfer as AcTransferModelType | undefined)
  ?? mongoose.model<AcTransferDocument>('AcTransfer', acTransferSchema);
