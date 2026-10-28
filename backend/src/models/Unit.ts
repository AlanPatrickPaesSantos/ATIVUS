import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export type OrganizationalUnitKind =
  | 'intermediate_command'
  | 'bpm'
  | 'cipm'
  | 'specialized_unit'
  | 'cime'
  | 'cipamb'
  | 'organic_company'
  | 'pel_dest'
  | 'ppd'
  | 'other';
export type OrganizationalVerificationStatus = 'confirmed' | 'divergent' | 'pending';

export interface OrganizationalUnitInput {
  id: string;
  parentUnitId?: string | null;
}

export function validateUnitHierarchy(units: OrganizationalUnitInput[]): string[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const errors: string[] = [];

  for (const unit of units) {
    const visited = new Set<string>();
    let current: OrganizationalUnitInput | undefined = unit;
    while (current?.parentUnitId) {
      if (current.parentUnitId === unit.id || visited.has(current.parentUnitId)) {
        errors.push(`Unidade ${unit.id} referencia uma hierarquia cíclica.`);
        break;
      }
      visited.add(current.id);
      const parent = byId.get(current.parentUnitId);
      if (!parent) {
        errors.push(`Unidade ${unit.id} referencia uma unidade superior inexistente: ${current.parentUnitId}.`);
        break;
      }
      current = parent;
    }
  }

  return [...new Set(errors)];
}

const unitSchema = new Schema({
  id: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  acronym: { type: String, required: true, trim: true },
  active: { type: Boolean, required: true, default: true },
  kind: { type: String, enum: ['intermediate_command', 'bpm', 'cipm', 'specialized_unit', 'cime', 'cipamb', 'organic_company', 'pel_dest', 'ppd', 'other'] satisfies OrganizationalUnitKind[] },
  parentUnitId: { type: String, trim: true, default: null },
  independent: { type: Boolean },
  seatMunicipality: { type: String, trim: true },
  jurisdictionMunicipalities: { type: [String], default: undefined },
  verificationStatus: { type: String, enum: ['confirmed', 'divergent', 'pending'] satisfies OrganizationalVerificationStatus[] },
  sourceIds: { type: [String], default: undefined },
  sourceDate: { type: Date },
  sourceReference: { type: String, trim: true },
  importBatchId: { type: String, trim: true },
}, { timestamps: true });

unitSchema.index({ active: 1, name: 1 });
unitSchema.index({ parentUnitId: 1, active: 1 });
unitSchema.index({ kind: 1, active: 1 });

unitSchema.path('parentUnitId').validate(function validateOrganizationParent(value: unknown) {
  return value === null || value === undefined || value !== this.id;
}, 'Uma unidade não pode ser superior de si mesma.');

export type UnitDocument = InferSchemaType<typeof unitSchema>;
type UnitModelType = Model<UnitDocument>;

export const UnitModel = (mongoose.models.Unit as UnitModelType | undefined)
  ?? mongoose.model<UnitDocument>('Unit', unitSchema);
