import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import type { UnitReference } from './User.js';

export const CALL_PROBLEMS = ['software', 'hardware', 'printer', 'network', 'radio'] as const;
export const CALL_PRIORITIES = ['Baixa', 'Média', 'Alta', 'Crítica'] as const;
export const CALL_PRIORITY_INPUTS = ['low', 'medium', 'high', 'critical'] as const;
export const TRIAGE_STATUSES = ['Em análise', 'Em atendimento', 'Aguardando informação', 'Resolvido', 'Encerrado'] as const;
export const CALL_PRIORITY_LABELS: Record<typeof CALL_PRIORITY_INPUTS[number], CallPriority> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
export type CallProblem = typeof CALL_PROBLEMS[number];
export type CallPriority = typeof CALL_PRIORITIES[number];

const unitSchema = new Schema<UnitReference>({ id: String, name: String, acronym: String }, { _id: false });
const attachmentSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  size: { type: Number, required: true, min: 0 },
  uploadedAt: { type: Date, required: true },
  status: { type: String, required: true, enum: ['active'], default: 'active' },
  storageKey: { type: String, required: true },
}, { _id: false });
const callSchema = new Schema({
  protocol: { type: String, required: true, unique: true, trim: true },
  problem: { type: String, required: true, enum: CALL_PROBLEMS },
  priority: { type: String, required: true, enum: CALL_PRIORITIES },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true },
  section: { type: String, required: true, enum: ['Suporte', 'Telecom'] },
  status: { type: String, required: true, default: 'Aberto', enum: ['Aberto', ...TRIAGE_STATUSES] },
  unit: { type: unitSchema, required: true },
  equipmentId: { type: String, default: null },
  attachments: { type: [attachmentSchema], default: [] },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, default: null },
}, { timestamps: true });
callSchema.index({ 'unit.id': 1, createdAt: -1, _id: 1 });
export type CallDocument = InferSchemaType<typeof callSchema>;
type CallModelType = Model<CallDocument>;
export const CallModel = (mongoose.models.Call as CallModelType | undefined) ?? mongoose.model<CallDocument>('Call', callSchema);
