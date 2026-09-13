import { CallModel, type CallPriority, type CallProblem, TRIAGE_STATUSES } from '../models/Call.js';
import type { InventoryScope } from './equipmentReadRepository.js';
import type { UnitReference } from '../models/User.js';
import type { ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import { EquipmentModel } from '../models/Equipment.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { publicAttachment, type AttachmentMetadata } from '../services/attachments.js';

export interface CallInput { problem: CallProblem; priority: CallPriority; subject: string; description: string; equipmentId?: string; unit: UnitReference; createdBy: string; attachments?: AttachmentMetadata[] }
export interface TriageInput { callId: string; updatedAt: Date; status: typeof TRIAGE_STATUSES[number]; priority: CallPriority; section: 'Suporte' | 'Telecom'; updatedBy: string }
export interface CallAuditRecord { id: string; protocol: string; subject: string; unit: UnitReference; status: string; priority: CallPriority; section: 'Suporte' | 'Telecom'; updatedAt: Date }
export interface CallHistoryEntry { id: string; description: string; occurredAt: string }
export function sectionFor(problem: CallProblem) { return ['network', 'radio'].includes(problem) ? 'Telecom' as const : 'Suporte' as const; }
export function protocolFor(date = new Date()) { const random = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0'); return `CH-${date.getFullYear()}-${random}`; }
function project(document: any) { return { id: String(document._id), subject: document.subject, unitId: document.unit.id, unitName: document.unit.name, priority: document.priority, status: document.status, section: document.section, updatedAt: document.updatedAt.toISOString() }; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function statusFromSnapshot(value: unknown) { return isRecord(value) && typeof value.status === 'string' ? value.status : null; }
function publicEquipment(document: any) {
  return document ? { id: String(document._id), patrimony: document.patrimony, type: document.type, model: document.model, brand: document.brand } : null;
}
function historyFor(call: any, audits: any[]): CallHistoryEntry[] {
  return [
    { id: `call-opened-${String(call._id)}`, description: 'Chamado aberto pela Unidade.', occurredAt: call.createdAt.toISOString() },
    ...audits.map((event) => {
      const beforeStatus = statusFromSnapshot(event.before);
      const afterStatus = statusFromSnapshot(event.after);
      return {
        id: String(event._id),
        description: beforeStatus && afterStatus ? `Triagem DITEL registrada: ${beforeStatus} → ${afterStatus}.` : 'Triagem DITEL registrada.',
        occurredAt: event.createdAt.toISOString(),
      };
    }),
  ];
}
export async function listCalls(scope: InventoryScope) { const filter = scope.role === 'unit_user' ? { 'unit.id': scope.unitId } : {}; const docs = await CallModel.find(filter).sort({ createdAt: -1, _id: 1 }).lean().exec(); return { items: docs.map(project) }; }
export async function getCallDetails(scope: InventoryScope, callId: string) {
  const filter = scope.role === 'unit_user' ? { _id: callId, 'unit.id': scope.unitId } : { _id: callId };
  const call = await CallModel.findOne(filter).lean().exec();
  if (!call) return null;
  const [equipment, auditEvents] = await Promise.all([
    call.equipmentId && mongoose.isValidObjectId(call.equipmentId)
      ? EquipmentModel.findOne({ _id: call.equipmentId, 'unit.id': call.unit.id }).select({ _id: 1, patrimony: 1, type: 1, model: 1, brand: 1 }).lean().exec()
      : null,
    AuditEventModel.find({ action: 'calls.triage', result: 'success', 'entity.type': 'call', 'entity.id': String(call._id) })
      .select({ _id: 1, before: 1, after: 1, createdAt: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec(),
  ]);
  return {
    id: String(call._id),
    protocol: call.protocol,
    problem: call.problem,
    subject: call.subject,
    description: call.description,
    unit: call.unit,
    requestedBy: call.createdBy,
    priority: call.priority,
    status: call.status,
    section: call.section,
    equipment: publicEquipment(equipment),
    openedAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
    attachments: (call.attachments ?? []).map(publicAttachment),
    history: historyFor(call, auditEvents),
  };
}
export async function createCall(input: CallInput, session?: ClientSession) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [doc] = await CallModel.create(
        [{ ...input, section: sectionFor(input.problem), status: 'Aberto', protocol: protocolFor() }],
        session ? { session } : undefined,
      );
      return { id: doc.id, protocol: doc.protocol };
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
    }
  }
  throw new Error('Unable to allocate a unique call protocol');
}
export async function updateCallTriage(input: TriageInput, session?: ClientSession) { return CallModel.findOneAndUpdate({ _id: input.callId, updatedAt: input.updatedAt }, { $set: { status: input.status, priority: input.priority, section: input.section, updatedBy: input.updatedBy } }, { new: true, runValidators: true, ...(session ? { session } : {}) }).lean().exec(); }
export async function callExists(callId: string) { return Boolean(await CallModel.exists({ _id: callId })); }
export async function findCallAuditRecord(callId: string, session?: ClientSession): Promise<CallAuditRecord | null> {
  const query = CallModel.findById(callId)
    .select({ _id: 1, protocol: 1, subject: 1, unit: 1, status: 1, priority: 1, section: 1, updatedAt: 1 })
    .lean();
  if (session) query.session(session);
  const call = await query.exec();
  if (!call) return null;
  return { id: String(call._id), protocol: call.protocol, subject: call.subject, unit: call.unit as UnitReference, status: call.status, priority: call.priority as CallPriority, section: call.section as 'Suporte' | 'Telecom', updatedAt: call.updatedAt as Date };
}
