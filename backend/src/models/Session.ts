import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const sessionSchema = new Schema(
  {
    tokenDigest: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    lastActivityAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

sessionSchema.index({ tokenDigest: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 });

export type SessionDocument = InferSchemaType<typeof sessionSchema>;
type SessionModelType = Model<SessionDocument>;

export const SessionModel = (mongoose.models.Session as SessionModelType | undefined)
  ?? mongoose.model<SessionDocument>('Session', sessionSchema);
