import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const unitSchema = new Schema({
  id: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  acronym: { type: String, required: true, trim: true },
  active: { type: Boolean, required: true, default: true },
}, { timestamps: true });

unitSchema.index({ active: 1, name: 1 });

export type UnitDocument = InferSchemaType<typeof unitSchema>;
type UnitModelType = Model<UnitDocument>;

export const UnitModel = (mongoose.models.Unit as UnitModelType | undefined)
  ?? mongoose.model<UnitDocument>('Unit', unitSchema);
