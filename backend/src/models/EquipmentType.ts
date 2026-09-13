import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const equipmentTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

equipmentTypeSchema.index({ active: 1, name: 1 });

export type EquipmentTypeDocument = InferSchemaType<typeof equipmentTypeSchema>;
type EquipmentTypeModelType = Model<EquipmentTypeDocument>;

export const EquipmentTypeModel = (mongoose.models.EquipmentType as EquipmentTypeModelType | undefined)
  ?? mongoose.model<EquipmentTypeDocument>('EquipmentType', equipmentTypeSchema);