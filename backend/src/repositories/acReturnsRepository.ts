import mongoose, { type ClientSession } from 'mongoose';

import { AC_RETURNABLE_SITUATIONS, AcReturnModel, type AcReturnEquipmentSnapshot, type AcReturnStatus, type ValidatedAcReturnRequest } from '../models/AcReturn.js';
import { EquipmentModel, type EquipmentCustody } from '../models/Equipment.js';
import type { UnitReference } from '../models/User.js';
import { acquirePatrimonialOperationLock, assertNoPendingPatrimonialOperation, releasePatrimonialOperationLock } from './patrimonialConflictRepository.js';
import { assertOperationalWritesOpen } from './operationalMaintenanceRepository.js';

export class AcReturnDomainError extends Error {
  constructor(public readonly code: 'AC_RETURN_EQUIPMENT_UNAVAILABLE' | 'AC_RETURN_CONFLICT' | 'AC_RETURN_DECISION_CONFLICT', message: string) {
    super(message);
    this.name = 'AcReturnDomainError';
  }
}

function publicReturn(document: any) {
  return {
    id: String(document._id), equipmentId: document.equipmentId, origin: document.origin, requestedBy: document.requestedBy,
    ...(document.requestReason ? { requestReason: document.requestReason } : {}), status: document.status,
    ...(document.decisionReason ? { decisionReason: document.decisionReason } : {}),
    ...(document.decidedBy ? { decidedBy: document.decidedBy } : {}),
    ...(document.decidedAt ? { decidedAt: new Date(document.decidedAt).toISOString() } : {}), ...(document.cancelledBy ? { cancelledBy: document.cancelledBy } : {}), ...(document.cancelledAt ? { cancelledAt: new Date(document.cancelledAt).toISOString() } : {}), divergences: document.divergences ?? [],
    equipment: { ...document.equipment, equipmentUpdatedAt: new Date(document.equipment.equipmentUpdatedAt).toISOString() },
    createdAt: new Date(document.createdAt).toISOString(), updatedAt: new Date(document.updatedAt).toISOString(),
  };
}

function unitCustodyFilter(unitId: string) {
  return { 'unit.id': unitId, $or: [{ 'custody.scope': 'UNIT', 'custody.unit.id': unitId }, { custody: null }, { custody: { $exists: false } }] };
}

function snapshot(document: any): AcReturnEquipmentSnapshot {
  return {
    patrimony: document.patrimony, type: document.type, model: document.model, brand: document.brand,
    ...(document.serialNumber ? { serialNumber: document.serialNumber } : {}), situation: document.situation,
    unit: document.unit, custody: (document.custody ?? null) as EquipmentCustody | null,
    equipmentUpdatedAt: new Date(document.updatedAt), equipmentVersion: typeof document.__v === 'number' ? document.__v : 0,
  };
}

export async function findAcReturnByIdempotencyKey(idempotencyKey: string) {
  const document = await AcReturnModel.findOne({ idempotencyKey }).lean().exec();
  return document ? { fingerprint: document.fingerprint, returnRequest: publicReturn(document) } : null;
}

export async function createAcReturnAndLock(input: ValidatedAcReturnRequest, origin: UnitReference, requestedBy: string, idempotencyKey: string, fingerprint: string, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const equipment = await EquipmentModel.findOne({ _id: input.equipmentId, situation: { $in: AC_RETURNABLE_SITUATIONS }, ...unitCustodyFilter(origin.id) }).session(session).lean().exec();
  if (!equipment) throw new AcReturnDomainError('AC_RETURN_EQUIPMENT_UNAVAILABLE', 'Equipamento não encontrado, indisponível ou fora do escopo da unidade.');
  await assertNoPendingPatrimonialOperation(input.equipmentId, session);
  const returnId = new mongoose.Types.ObjectId().toString();
  await acquirePatrimonialOperationLock(input.equipmentId, returnId, 'ac_return', session);
  const [document] = await AcReturnModel.create([{
    _id: returnId, equipmentId: input.equipmentId, origin, requestedBy, requestReason: input.reason ?? null, status: 'Pendente', equipment: snapshot(equipment), idempotencyKey, fingerprint,
  }], { session });
  return publicReturn(document.toObject());
}

export async function cancelAcReturn(input: { id: string; updatedAt: Date; reason: string; cancelledBy: string }, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const updated = await AcReturnModel.findOneAndUpdate({ _id: input.id, status: 'Pendente', updatedAt: input.updatedAt }, { $set: { status: 'Cancelada', decisionReason: input.reason, cancelledBy: input.cancelledBy, cancelledAt: new Date() } }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) return null;
  await releasePatrimonialOperationLock(input.id, session);
  return publicReturn(updated);
}

export async function listAcReturns(scope: { role: 'unit_user' | 'ac_operator' | 'ditel_admin'; unitId: string | null }, page: number, pageSize: number) {
  const filter = scope.role === 'unit_user' ? { 'origin.id': scope.unitId } : {};
  const [total, documents] = await Promise.all([
    AcReturnModel.countDocuments(filter).exec(),
    AcReturnModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
  ]);
  return { items: documents.map(publicReturn), total, page, pageSize };
}

export async function readAcReturn(id: string, scope: { role: 'unit_user' | 'ac_operator' | 'ditel_admin'; unitId: string | null }) {
  if (!mongoose.isValidObjectId(id)) return null;
  const filter: Record<string, unknown> = { _id: id };
  if (scope.role === 'unit_user') filter['origin.id'] = scope.unitId;
  const document = await AcReturnModel.findOne(filter).lean().exec();
  return document ? publicReturn(document) : null;
}

export async function decideAcReturn(input: { id: string; updatedAt: Date; status: Exclude<AcReturnStatus, 'Pendente'>; reason?: string; decidedBy: string }, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const current = await AcReturnModel.findOne({ _id: input.id, status: 'Pendente', updatedAt: input.updatedAt }).session(session).lean().exec();
  if (!current) return null;
  const nextStatus = input.status === 'Aceita' ? 'Aguardando recebimento' : input.status;
  const updated = await AcReturnModel.findOneAndUpdate(
    { _id: input.id, status: 'Pendente', updatedAt: input.updatedAt },
    { $set: { status: nextStatus, decisionReason: input.reason ?? null, decidedBy: input.decidedBy, decidedAt: new Date() } },
    { new: true, runValidators: true, session },
  ).lean().exec();
  if (!updated) throw new AcReturnDomainError('AC_RETURN_DECISION_CONFLICT', 'A devolução já foi decidida ou está desatualizada.');
  if (nextStatus === 'Rejeitada') await releasePatrimonialOperationLock(input.id, session);
  return publicReturn(updated);
}

export async function receiveAcReturn(input: { id: string; updatedAt: Date; status: 'Recebida' | 'Divergência'; description?: string; receivedBy: string }, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const current = await AcReturnModel.findOne({ _id: input.id, status: 'Aguardando recebimento', updatedAt: input.updatedAt }).session(session).lean().exec();
  if (!current) {
    const completed = await AcReturnModel.findOne({ _id: input.id, status: 'Recebida' }).session(session).lean().exec();
    return completed && input.status === 'Recebida' ? publicReturn(completed) : null;
  }
  if (input.status === 'Divergência' && !input.description) throw new AcReturnDomainError('AC_RETURN_DECISION_CONFLICT', 'A descrição da divergência é obrigatória.');
  if (input.status === 'Recebida') {
    const updatedEquipment = await EquipmentModel.findOneAndUpdate({ _id: current.equipmentId, situation: { $in: AC_RETURNABLE_SITUATIONS }, ...unitCustodyFilter(current.origin.id), updatedAt: current.equipment.equipmentUpdatedAt, __v: current.equipment.equipmentVersion }, { $set: { unit: null, custody: { scope: 'AC', unit: null }, updatedBy: input.receivedBy }, $push: { history: { id: `equipment-ac-return-receipt-${input.id}`, description: 'Recebimento de equipamento pela AC', occurredAt: new Date() } }, $inc: { __v: 1 } }, { new: true, runValidators: false, session }).exec();
    if (!updatedEquipment) throw new AcReturnDomainError('AC_RETURN_DECISION_CONFLICT', 'O equipamento foi alterado ou já não está sob responsabilidade da unidade.');
  }
  const divergence = input.status === 'Divergência' ? { description: input.description!, reportedBy: input.receivedBy, reportedAt: new Date(), resolutionStatus: 'pending' as const, resolvedBy: null, resolvedAt: null, resolution: null } : undefined;
  const updated = await AcReturnModel.findOneAndUpdate({ _id: input.id, status: 'Aguardando recebimento', updatedAt: input.updatedAt }, { $set: { status: input.status }, ...(divergence ? { $push: { divergences: divergence } } : {}) }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) throw new AcReturnDomainError('AC_RETURN_DECISION_CONFLICT', 'A devolução já foi recebida ou está desatualizada.');
  if (input.status === 'Recebida') await releasePatrimonialOperationLock(input.id, session);
  return publicReturn(updated);
}

export async function resolveAcReturnDivergence(input: { id: string; updatedAt: Date; action: 'retomar' | 'rejeitar'; resolution: string; resolvedBy: string }, session: ClientSession) {
  await assertOperationalWritesOpen(session);
  const current = await AcReturnModel.findOne({ _id: input.id, status: 'Divergência', updatedAt: input.updatedAt }).session(session).lean().exec();
  if (!current || !input.resolution.trim()) return null;
  const divergences = [...(current.divergences ?? [])] as any[]; const index = divergences.length - 1;
  if (index < 0 || divergences[index].resolutionStatus !== 'pending') return null;
  divergences[index] = { ...divergences[index], resolutionStatus: 'resolved', resolvedBy: input.resolvedBy, resolvedAt: new Date(), resolution: input.resolution.trim() };
  const status = input.action === 'retomar' ? 'Aguardando recebimento' : 'Rejeitada';
  const updated = await AcReturnModel.findOneAndUpdate({ _id: input.id, status: 'Divergência', updatedAt: input.updatedAt }, { $set: { status, divergences } }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) throw new AcReturnDomainError('AC_RETURN_DECISION_CONFLICT', 'A divergência já foi resolvida ou está desatualizada.');
  if (status === 'Rejeitada') await releasePatrimonialOperationLock(input.id, session);
  return publicReturn(updated);
}
