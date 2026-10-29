import { EquipmentModel } from '../models/Equipment.js';
import { MovementModel, type MovementDocument, type MovementStatus } from '../models/Movement.js';
import type { UnitReference } from '../models/User.js';
import mongoose, { type ClientSession } from 'mongoose';
import { acquirePatrimonialOperationLock, assertNoPendingPatrimonialOperation, releasePatrimonialOperationLock } from './patrimonialConflictRepository.js';
import { assertOperationalWritesOpen } from './operationalMaintenanceRepository.js';

export interface MovementCreateInput { equipmentId: string; origin: UnitReference; destination: UnitReference; requestedBy: string }
type MovementViewDocument = MovementDocument & { _id?: unknown; createdAt: Date; updatedAt: Date };
export function movementView(document: MovementViewDocument, equipment?: { patrimony: string; type: string; model: string }) { return { id: String(document._id), type: document.type, equipmentId: document.equipmentId, ...(equipment ? { equipment } : {}), origin: document.origin, destination: document.destination, requestedBy: document.requestedBy, status: document.status, ...(document.decisionReason ? { decisionReason: document.decisionReason } : {}), ...(document.cancelledBy ? { cancelledBy: document.cancelledBy } : {}), ...(document.cancelledAt ? { cancelledAt: new Date(document.cancelledAt).toISOString() } : {}), divergences: document.divergences ?? [], createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString() }; }
export async function createMovement(input: MovementCreateInput, session?: ClientSession) { const operationId = new mongoose.Types.ObjectId().toString(); if (session) { await assertOperationalWritesOpen(session); await assertNoPendingPatrimonialOperation(input.equipmentId, session); await acquirePatrimonialOperationLock(input.equipmentId, operationId, 'movement', session); } const [document] = await MovementModel.create([{ _id: operationId, ...input, type: 'Transferência definitiva', status: 'Pendente' }], session ? { session } : undefined); return movementView(document); }
export async function listMovements(scope: { role: 'unit_user' | 'ditel_admin'; unitId: string | null }) { const filter = scope.role === 'unit_user' ? { $or: [{ 'origin.id': scope.unitId }, { 'destination.id': scope.unitId }] } : {}; const docs = await MovementModel.find(filter).sort({ createdAt: -1, _id: 1 }).lean().exec(); const equipmentIds = [...new Set(docs.map((doc) => doc.equipmentId))]; const equipment = await EquipmentModel.find({ _id: { $in: equipmentIds } }).select({ patrimony: 1, type: 1, model: 1 }).lean().exec(); const equipmentById = new Map(equipment.map((item) => [String(item._id), { patrimony: item.patrimony, type: item.type, model: item.model }])); return { items: docs.map((doc) => movementView(doc, equipmentById.get(doc.equipmentId))) }; }
export async function movementExists(id: string) { return Boolean(await MovementModel.exists({ _id: id })); }
export async function cancelMovement(input: { id: string; updatedAt: Date; reason: string; cancelledBy: string }, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const updated = await MovementModel.findOneAndUpdate({ _id: input.id, status: 'Pendente', updatedAt: input.updatedAt }, { $set: { status: 'Cancelada', decisionReason: input.reason, cancelledBy: input.cancelledBy, cancelledAt: new Date() } }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) return null;
  await releasePatrimonialOperationLock(input.id, session);
  return movementView(updated);
}

async function decideMovementWithinSession(session: ClientSession, input: { id: string; updatedAt: Date; status: Exclude<MovementStatus, 'Pendente'>; reason?: string; decidedBy: string }) {
  await assertOperationalWritesOpen(session);
  const current = await MovementModel.findOne({ _id: input.id, status: 'Pendente', updatedAt: input.updatedAt }).session(session).lean().exec();
  if (!current) return null;
  const nextStatus = input.status === 'Aprovada' ? 'Aguardando recebimento' : input.status;
  const updated = await MovementModel.findOneAndUpdate({ _id: input.id, status: 'Pendente', updatedAt: input.updatedAt }, { $set: { status: nextStatus, decisionReason: input.reason ?? null, decidedBy: input.decidedBy } }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) throw new Error('MOVEMENT_CONFLICT');
  if (nextStatus === 'Rejeitada') await releasePatrimonialOperationLock(input.id, session);
  return movementView(updated);
}
export async function decideMovement(input: { id: string; updatedAt: Date; status: Exclude<MovementStatus, 'Pendente'>; reason?: string; decidedBy: string }, session?: ClientSession) {
  if (session) return decideMovementWithinSession(session, input);
  const ownSession = await mongoose.startSession();
  try { let result: ReturnType<typeof movementView> | null = null; await ownSession.withTransaction(async () => { result = await decideMovementWithinSession(ownSession, input); }); return result; } finally { await ownSession.endSession(); }
}

export async function receiveMovement(input: { id: string; updatedAt: Date; status: 'Recebida' | 'Divergência'; description?: string; receivedBy: string }, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const current = await MovementModel.findOne({ _id: input.id, status: 'Aguardando recebimento', updatedAt: input.updatedAt }).session(session).lean().exec();
  if (!current) {
    const completed = await MovementModel.findOne({ _id: input.id, status: 'Recebida' }).session(session).lean().exec();
    return completed && input.status === 'Recebida' ? movementView(completed as MovementViewDocument) : null;
  }
  if (input.status === 'Divergência' && !input.description) throw new Error('MOVEMENT_DIVERGENCE_DESCRIPTION_REQUIRED');
  if (input.status === 'Recebida') {
    const equipment = await EquipmentModel.findOneAndUpdate({ _id: current.equipmentId, situation: 'active', 'unit.id': current.origin.id, $or: [{ 'custody.scope': 'UNIT', 'custody.unit.id': current.origin.id }, { custody: null }, { custody: { $exists: false } }] }, { $set: { unit: current.destination, custody: { scope: 'UNIT', unit: current.destination }, updatedBy: input.receivedBy }, $push: { history: { id: `equipment-movement-receipt-${input.id}`, description: `Recebimento da transferência em ${current.destination.name}`, occurredAt: new Date() } } }, { new: true, runValidators: false, session }).exec();
    if (!equipment) throw new Error('EQUIPMENT_CONFLICT');
  }
  const divergence = input.status === 'Divergência' ? { description: input.description!, reportedBy: input.receivedBy, reportedAt: new Date(), resolutionStatus: 'pending' as const, resolvedBy: null, resolvedAt: null, resolution: null } : undefined;
  const updated = await MovementModel.findOneAndUpdate({ _id: input.id, status: 'Aguardando recebimento', updatedAt: input.updatedAt }, { $set: { status: input.status }, ...(divergence ? { $push: { divergences: divergence } } : {}) }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) throw new Error('MOVEMENT_CONFLICT');
  if (input.status === 'Recebida') await releasePatrimonialOperationLock(input.id, session);
  return movementView(updated);
}

export async function resolveMovementDivergence(input: { id: string; updatedAt: Date; action: 'retomar' | 'rejeitar'; resolution: string; resolvedBy: string }, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const current = await MovementModel.findOne({ _id: input.id, status: 'Divergência', updatedAt: input.updatedAt }).session(session).lean().exec();
  if (!current || !input.resolution.trim()) return null;
  const divergences = [...(current.divergences ?? [])] as any[]; const index = divergences.length - 1;
  if (index < 0 || divergences[index].resolutionStatus !== 'pending') return null;
  divergences[index] = { ...divergences[index], resolutionStatus: 'resolved', resolvedBy: input.resolvedBy, resolvedAt: new Date(), resolution: input.resolution.trim() };
  const status = input.action === 'retomar' ? 'Aguardando recebimento' : 'Rejeitada';
  const updated = await MovementModel.findOneAndUpdate({ _id: input.id, status: 'Divergência', updatedAt: input.updatedAt }, { $set: { status, divergences } }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) throw new Error('MOVEMENT_CONFLICT');
  if (status === 'Rejeitada') await releasePatrimonialOperationLock(input.id, session);
  return movementView(updated);
}
