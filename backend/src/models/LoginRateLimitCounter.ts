import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const loginRateLimitCounterSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    scope: { type: String, enum: ['ip', 'registration'], required: true },
    value: { type: String, required: true, trim: true },
    count: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  {
    versionKey: false,
  },
);

loginRateLimitCounterSchema.index({ key: 1 }, { unique: true });
loginRateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type LoginRateLimitCounterDocument = InferSchemaType<typeof loginRateLimitCounterSchema>;
type LoginRateLimitCounterModelType = Model<LoginRateLimitCounterDocument>;

export const LoginRateLimitCounterModel = (mongoose.models.LoginRateLimitCounter as LoginRateLimitCounterModelType | undefined)
  ?? mongoose.model<LoginRateLimitCounterDocument>('LoginRateLimitCounter', loginRateLimitCounterSchema);
