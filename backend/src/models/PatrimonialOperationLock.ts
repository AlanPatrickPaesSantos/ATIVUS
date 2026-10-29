import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const PATRIMONIAL_OPERATION_KINDS = ['movement', 'ac_return'] as const;
export type PatrimonialOperationKind = typeof PATRIMONIAL_OPERATION_KINDS[number];

const patrimonialOperationLockSchema = new Schema({
  equipmentId: { type: String, required: true, trim: true },
  operationId: { type: String, required: true, trim: true },
  kind: { type: String, required: true, enum: PATRIMONIAL_OPERATION_KINDS },
}, { timestamps: true });

patrimonialOperationLockSchema.index({ equipmentId: 1 }, { unique: true });
patrimonialOperationLockSchema.index({ operationId: 1 }, { unique: true });

export type PatrimonialOperationLockDocument = InferSchemaType<typeof patrimonialOperationLockSchema>;
type PatrimonialOperationLockModelType = Model<PatrimonialOperationLockDocument>;

export const PatrimonialOperationLockModel = (mongoose.models.PatrimonialOperationLock as PatrimonialOperationLockModelType | undefined)
  ?? mongoose.model<PatrimonialOperationLockDocument>('PatrimonialOperationLock', patrimonialOperationLockSchema);
