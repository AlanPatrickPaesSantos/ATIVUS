import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

import type { UnitReference } from './User.js';

export type EquipmentSituation = 'active' | 'maintenance' | 'inactive' | 'lost' | 'written_off';
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
    unit: { type: unitReferenceSchema, required: true },
    serialNumber: { type: String, trim: true }, category: { type: String, trim: true, default: '' }, warranty: { type: String, trim: true }, observations: { type: String, trim: true }, createdBy: { type: String, trim: true, default: '' }, updatedBy: { type: String, trim: true }, history: { type: [historyEntrySchema], default: [] }, attachments: { type: [attachmentSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

equipmentSchema.index({ 'unit.id': 1, situation: 1 });
equipmentSchema.index({ patrimony: 1 }, { unique: true });

export type EquipmentDocument = InferSchemaType<typeof equipmentSchema>;
type EquipmentModelType = Model<EquipmentDocument>;

export const EquipmentModel = (mongoose.models.Equipment as EquipmentModelType | undefined)
  ?? mongoose.model<EquipmentDocument>('Equipment', equipmentSchema);
