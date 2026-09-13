import { EquipmentModel } from '../models/Equipment.js';
import { MovementModel, type MovementStatus } from '../models/Movement.js';
import type { UnitReference } from '../models/User.js';
import mongoose, { type ClientSession } from 'mongoose';

export interface MovementCreateInput { equipmentId: string; origin: UnitReference; destination: UnitReference; requestedBy: string }
export function movementView(document: any) { return { id: String(document._id), type: document.type, equipmentId: document.equipmentId, origin: document.origin, destination: document.destination, requestedBy: document.requestedBy, status: document.status, ...(document.decisionReason ? { decisionReason: document.decisionReason } : {}), createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString() }; }
export async function createMovement(input: MovementCreateInput, session?: ClientSession) { const [document] = await MovementModel.create([{ ...input, type: 'Transferência definitiva', status: 'Pendente' }], session ? { session } : undefined); return movementView(document); }
export async function listMovements(scope: { role: 'unit_user' | 'ditel_admin'; unitId: string | null }) { const filter = scope.role === 'unit_user' ? { $or: [{ 'origin.id': scope.unitId }, { 'destination.id': scope.unitId }] } : {}; const docs = await MovementModel.find(filter).sort({ createdAt: -1, _id: 1 }).lean().exec(); return { items: docs.map(movementView) }; }
export async function movementExists(id: string) { return Boolean(await MovementModel.exists({ _id: id })); }
async function decideMovementWithinSession(
  session: ClientSession,
  input: { id: string; updatedAt: Date; status: Exclude<MovementStatus, 'Pendente'>; reason?: string; decidedBy: string },
) {
  const current = await MovementModel.findOne({ _id: input.id, status: 'Pendente', updatedAt: input.updatedAt }).session(session).lean().exec();
  if (!current) return null;
  if (input.status === 'Aprovada') {
    const equipment = await EquipmentModel.findOneAndUpdate({ _id: current.equipmentId, 'unit.id': current.origin.id, 'history.0': { $exists: true } }, { $set: { unit: current.destination, updatedBy: input.decidedBy }, $push: { history: { id: `equipment-movement-${input.id}`, description: `Transferência para ${current.destination.name}`, occurredAt: new Date() } } }, { new: true, runValidators: true, session }).exec();
    if (!equipment) throw new Error('EQUIPMENT_CONFLICT');
  }
  const updated = await MovementModel.findOneAndUpdate({ _id: input.id, status: 'Pendente', updatedAt: input.updatedAt }, { $set: { status: input.status, decisionReason: input.reason ?? null, decidedBy: input.decidedBy } }, { new: true, runValidators: true, session }).lean().exec();
  if (!updated) throw new Error('MOVEMENT_CONFLICT');
  return movementView(updated);
}
export async function decideMovement(input: { id: string; updatedAt: Date; status: Exclude<MovementStatus, 'Pendente'>; reason?: string; decidedBy: string }, session?: ClientSession) {
  if (session) {
    return decideMovementWithinSession(session, input);
  }
  const ownSession = await mongoose.startSession();
  try {
    let result: ReturnType<typeof movementView> | null = null;
    await ownSession.withTransaction(async () => {
      result = await decideMovementWithinSession(ownSession, input);
    });
    return result;
  } finally { await ownSession.endSession(); }
}
