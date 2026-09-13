import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import type { UnitReference } from './User.js';

export const MOVEMENT_STATUSES = ['Pendente', 'Aprovada', 'Rejeitada'] as const;
export type MovementStatus = typeof MOVEMENT_STATUSES[number];
const unitSchema = new Schema<UnitReference>({ id: { type: String, required: true }, name: { type: String, required: true }, acronym: { type: String, required: true } }, { _id: false });
const movementSchema = new Schema({
  type: { type: String, required: true, enum: ['Transferência definitiva'] },
  equipmentId: { type: String, required: true },
  origin: { type: unitSchema, required: true },
  destination: { type: unitSchema, required: true },
  requestedBy: { type: String, required: true },
  status: { type: String, required: true, enum: MOVEMENT_STATUSES, default: 'Pendente' },
  decisionReason: { type: String, default: null },
  decidedBy: { type: String, default: null },
}, { timestamps: true, optimisticConcurrency: true });
movementSchema.index({ 'origin.id': 1, createdAt: -1, _id: 1 });
movementSchema.index({ equipmentId: 1 }, { unique: true, partialFilterExpression: { status: 'Pendente' } });
export type MovementDocument = InferSchemaType<typeof movementSchema>;
type MovementModelType = Model<MovementDocument>;
export const MovementModel = (mongoose.models.Movement as MovementModelType | undefined) ?? mongoose.model<MovementDocument>('Movement', movementSchema);
