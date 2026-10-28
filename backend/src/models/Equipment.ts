import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

import { isValidUnitReference, type UnitReference } from './User.js';

export type EquipmentSituation = 'active' | 'maintenance' | 'inactive' | 'lost' | 'written_off';
export type EquipmentCustodyScope = 'AC' | 'UNIT';
export interface EquipmentCustody {
  scope: EquipmentCustodyScope;
  unit: UnitReference | null;
}

export interface EquipmentProvenance {
  synthetic: boolean;
  generator?: string;
  generatorVersion?: string;
  importBatchId?: string;
  source?: string;
}

export function isValidEquipmentCustody(value: unknown): value is EquipmentCustody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const custody = value as Partial<EquipmentCustody>;
  if (custody.scope === 'AC') {
    return custody.unit === null;
  }

  return custody.scope === 'UNIT' && isValidUnitReference(custody.unit);
}

export function unitEquipmentCustody(unit: UnitReference): EquipmentCustody {
  return { scope: 'UNIT', unit };
}
function sameUnitReference(left: unknown, right: unknown): boolean {
  return isValidUnitReference(left) && isValidUnitReference(right)
    && left.id === right.id && left.name === right.name && left.acronym === right.acronym;
}
const historyEntrySchema = new Schema({ id: { type: String, required: true }, description: { type: String, required: true }, occurredAt: { type: Date, required: true } }, { _id: false });
const attachmentSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  size: { type: Number, required: true, min: 0 },
  uploadedAt: { type: Date, required: true },
  status: { type: String, required: true, enum: ['active'], default: 'active' },
  storageKey: { type: String, required: true },
}, { _id: false });

const unitReferenceSchema = new Schema<UnitReference>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    acronym: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const equipmentCustodySchema = new Schema<EquipmentCustody>(
  {
    scope: { type: String, required: true, enum: ['AC', 'UNIT'] satisfies EquipmentCustodyScope[] },
    unit: { type: unitReferenceSchema, default: null },
  },
  { _id: false },
);

const equipmentProvenanceSchema = new Schema<EquipmentProvenance>(
  {
    synthetic: { type: Boolean, required: true },
    generator: { type: String, trim: true },
    generatorVersion: { type: String, trim: true },
    importBatchId: { type: String, trim: true },
    source: { type: String, trim: true },
  },
  { _id: false },
);

const equipmentSchema = new Schema(
  {
    patrimony: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    situation: {
      type: String,
      required: true,
      enum: ['active', 'maintenance', 'inactive', 'lost', 'written_off'] satisfies EquipmentSituation[],
    },
    location: { type: String, required: true, trim: true },
    section: { type: String, trim: true },
    unit: { type: unitReferenceSchema, default: null },
    custody: { type: equipmentCustodySchema, default: null },
    provenance: { type: equipmentProvenanceSchema },
    serialNumber: { type: String, trim: true }, category: { type: String, trim: true, default: '' }, warranty: { type: String, trim: true }, observations: { type: String, trim: true }, createdBy: { type: String, trim: true, default: '' }, updatedBy: { type: String, trim: true }, history: { type: [historyEntrySchema], default: [] }, attachments: { type: [attachmentSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

equipmentSchema.pre('validate', function validateCustodyConsistency(next) {
  const custody = this.custody;
  const unit = this.unit;

  if (custody === null || custody === undefined) {
    if (!isValidUnitReference(unit)) {
      this.invalidate('unit', 'Equipamento legado deve possuir uma unidade válida.');
    }
    next();
    return;
  }

  if (!isValidEquipmentCustody(custody)) {
    this.invalidate('custody', 'Custódia do equipamento inválida.');
    next();
    return;
  }

  if (custody.scope === 'AC') {
    if (unit !== null && unit !== undefined) {
      this.invalidate('unit', 'Equipamento sob custódia AC não pode possuir unidade.');
    }
    next();
    return;
  }

  if (!isValidUnitReference(unit)) {
    this.invalidate('unit', 'Equipamento sob custódia de unidade deve possuir unidade válida.');
  } else if (JSON.stringify(unit) !== JSON.stringify(custody.unit)) {
    this.invalidate('custody', 'A unidade do equipamento deve corresponder à unidade da custódia.');
  }
  next();
});

equipmentSchema.path('provenance').validate(function validateSyntheticProvenance(value: unknown) {
  const provenance = value as EquipmentProvenance | undefined;
  return !provenance?.synthetic || Boolean(provenance.generator && provenance.generatorVersion && provenance.importBatchId && provenance.source);
}, 'Proveniência sintética deve informar gerador, versão, lote e fonte.');

equipmentSchema.path('custody').validate(function validateCustodyPath(value: unknown) {
  if (value === null || value === undefined) return isValidUnitReference(this.unit);
  if (!isValidEquipmentCustody(value)) return false;
  const custody = value as EquipmentCustody;
  if (custody.scope === 'AC') return this.unit === null || this.unit === undefined;
  return sameUnitReference(this.unit, custody.unit);
}, 'Custódia do equipamento inválida.');

equipmentSchema.index({ 'unit.id': 1, situation: 1 });
equipmentSchema.index({ section: 1, type: 1, model: 1 });
equipmentSchema.index({ patrimony: 1 }, { unique: true });

export type EquipmentDocument = InferSchemaType<typeof equipmentSchema>;
type EquipmentModelType = Model<EquipmentDocument>;

export const EquipmentModel = (mongoose.models.Equipment as EquipmentModelType | undefined)
  ?? mongoose.model<EquipmentDocument>('Equipment', equipmentSchema);
