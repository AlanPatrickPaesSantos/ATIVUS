import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const missionNoteSchema = new Schema(
  {
    author: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

const missionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    type: { type: String, enum: ['maintenance', 'installation', 'inspection', 'training', 'other'], default: 'maintenance', required: true },
    status: { type: String, enum: ['assigned', 'in_progress', 'completed', 'cancelled'], default: 'assigned', required: true },
    unit: {
      type: new Schema({
        id: { type: String, required: true },
        name: { type: String, required: true },
        acronym: { type: String, default: '' },
      }, { _id: false }),
      required: true,
    },
    equipment: [{
      type: new Schema({
        id: { type: String, required: true },
        patrimony: { type: String, required: true },
        type: { type: String, required: true },
        model: { type: String, required: true },
        brand: { type: String, required: true },
      }, { _id: false }),
    }],
    assignedBy: { type: new Schema({ id: { type: String, required: true }, name: { type: String, required: true }, registration: { type: String, required: true } }, { _id: false }), required: true },
    assignedTo: { type: new Schema({ id: { type: String, required: true }, name: { type: String, required: true }, registration: { type: String, required: true } }, { _id: false }), required: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    notes: { type: [missionNoteSchema], default: [] },
  },
  { timestamps: true },
);

missionSchema.index({ 'unit.id': 1 });
missionSchema.index({ status: 1 });
missionSchema.index({ 'assignedBy.id': 1 });
missionSchema.index({ 'assignedTo.id': 1 });

export type MissionDocument = InferSchemaType<typeof missionSchema> & { _id: mongoose.Types.ObjectId };

export const MissionModel: Model<MissionDocument> =
  (mongoose.models.Mission as Model<MissionDocument> | undefined) ??
  mongoose.model<MissionDocument>('Mission', missionSchema);
