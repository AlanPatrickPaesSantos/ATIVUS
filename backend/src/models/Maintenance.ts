import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

import type { UnitReference } from './User.js';

export const MAINTENANCE_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export type MaintenanceStatus = typeof MAINTENANCE_STATUSES[number];

const unitReferenceSchema = new Schema<UnitReference>({
  id: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  acronym: { type: String, required: true, trim: true },
}, { _id: false });

const maintenanceEquipmentSchema = new Schema({
  id: { type: String, required: true, trim: true },
  patrimony: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  brand: { type: String, required: true, trim: true },
}, { _id: false });

const maintenanceCallSchema = new Schema({
  id: { type: String, required: true, trim: true },
  protocol: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
}, { _id: false });

const maintenanceSchema = new Schema({
  equipmentId: { type: String, required: true, trim: true },
  equipment: { type: maintenanceEquipmentSchema, required: true },
  callId: { type: String, trim: true },
  call: { type: maintenanceCallSchema },
  unit: { type: unitReferenceSchema, required: true },
  status: { type: String, required: true, enum: MAINTENANCE_STATUSES },
  type: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  diagnosis: { type: String, trim: true },
  service: { type: String, trim: true },
  technicalResponsible: { type: String, trim: true },
  completedAt: { type: Date },
  observations: { type: String, trim: true },
  openedAt: { type: Date, required: true },
}, { timestamps: true });

maintenanceSchema.index({ 'unit.id': 1, status: 1, updatedAt: -1, _id: -1 });
maintenanceSchema.index({ 'equipment.type': 1 });

export type MaintenanceDocument = InferSchemaType<typeof maintenanceSchema>;
type MaintenanceModelType = Model<MaintenanceDocument>;

export const MaintenanceModel = (mongoose.models.Maintenance as MaintenanceModelType | undefined)
  ?? mongoose.model<MaintenanceDocument>('Maintenance', maintenanceSchema);
