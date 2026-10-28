import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const schema = new Schema({
  _id: { type: String, default: 'patrimonial-writes' },
  active: { type: Boolean, required: true, default: false },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  actorId: { type: String, required: true, default: 'system' },
  activatedAt: { type: Date, default: null },
  deactivatedAt: { type: Date, default: null },
  revision: { type: Number, required: true, min: 0, default: 0 },
  writeEpoch: { type: Number, required: true, min: 0, default: 0 },
  lastWriteAt: { type: Date, default: null },
}, { timestamps: true, collection: 'operationalmaintenancewindows' });

export type OperationalMaintenanceWindowDocument = InferSchemaType<typeof schema>;
type OperationalMaintenanceWindowModelType = Model<OperationalMaintenanceWindowDocument>;

export const OperationalMaintenanceWindowModel = (mongoose.models.OperationalMaintenanceWindow as OperationalMaintenanceWindowModelType | undefined)
  ?? mongoose.model<OperationalMaintenanceWindowDocument>('OperationalMaintenanceWindow', schema);

export const OPERATIONAL_MAINTENANCE_WINDOW_ID = 'patrimonial-writes';
