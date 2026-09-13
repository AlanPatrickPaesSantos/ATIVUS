import type { ClientSession } from 'mongoose';

import { MissionModel, type MissionDocument } from '../models/Mission.js';

export type MissionInput = {
  title: string;
  description: string;
  type?: string;
  priority?: string;
  unit: { id: string; name: string; acronym?: string };
  equipment?: Array<{ id: string; patrimony: string; type: string; model: string; brand: string }>;
  assignedBy: { id: string; name: string; registration: string };
  assignedTo: { id: string; name: string; registration: string };
};

export async function getMissions(query: { unitId?: string; status?: string; role?: string }, session?: ClientSession) {
  const filter: Record<string, unknown> = {};
  if (query.unitId) filter['unit.id'] = query.unitId;
  if (query.status) filter.status = query.status;
  return MissionModel.find(filter).sort({ createdAt: -1 }).session(session ?? null).lean();
}

export async function getMissionById(id: string, session?: ClientSession) {
  return MissionModel.findById(id).session(session ?? null).lean();
}

export async function createMissionRecord(input: MissionInput, session?: ClientSession) {
  const created = new MissionModel({
    title: input.title,
    description: input.description,
    type: input.type ?? 'maintenance',
    status: 'assigned',
    unit: input.unit,
    equipment: input.equipment ?? [],
    assignedBy: input.assignedBy,
    assignedTo: input.assignedTo,
    priority: input.priority ?? 'medium',
  });
  await created.save({ session });
  return created.toObject();
}

export async function updateMissionRecord(id: string, update: Record<string, unknown>, session?: ClientSession) {
  return MissionModel.findByIdAndUpdate(id, update, { new: true, session }).lean();
}

export function toMissionListItem(document: MissionDocument & { _id?: unknown }) {
  return {
    id: String(document._id),
    title: document.title,
    description: document.description,
    type: document.type,
    status: document.status,
    unit: document.unit,
    equipment: document.equipment ?? [],
    assignedBy: document.assignedBy,
    assignedTo: document.assignedTo,
    priority: document.priority,
    startedAt: document.startedAt?.toISOString() ?? null,
    completedAt: document.completedAt?.toISOString() ?? null,
    notes: document.notes ?? [],
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
