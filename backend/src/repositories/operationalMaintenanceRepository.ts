import type { ClientSession } from 'mongoose';

import { OPERATIONAL_MAINTENANCE_WINDOW_ID, OperationalMaintenanceWindowModel, type OperationalMaintenanceWindowDocument } from '../models/OperationalMaintenanceWindow.js';

export class OperationalMaintenanceActiveError extends Error {
  readonly code = 'OPERATIONAL_MAINTENANCE_ACTIVE';

  constructor() {
    super('Operações patrimoniais temporariamente bloqueadas para manutenção.');
    this.name = 'OperationalMaintenanceActiveError';
  }
}

export interface OperationalMaintenanceWindowView {
  active: boolean;
  reason: string;
  actorId: string;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  revision: number;
}

const emptyWindow = (): OperationalMaintenanceWindowView => ({ active: false, reason: '', actorId: 'system', activatedAt: null, deactivatedAt: null, revision: 0 });

function view(document: OperationalMaintenanceWindowDocument | null): OperationalMaintenanceWindowView {
  if (!document) return emptyWindow();
  return { active: document.active, reason: document.reason ?? '', actorId: document.actorId ?? 'system', activatedAt: document.activatedAt ?? null, deactivatedAt: document.deactivatedAt ?? null, revision: document.revision };
}

export async function readOperationalMaintenanceWindow() {
  return view(await OperationalMaintenanceWindowModel.findById(OPERATIONAL_MAINTENANCE_WINDOW_ID).lean().exec() as OperationalMaintenanceWindowDocument | null);
}

export async function setOperationalMaintenanceWindow(input: { active: boolean; actorId: string; reason: string }, session?: ClientSession) {
  const current = await OperationalMaintenanceWindowModel.findById(OPERATIONAL_MAINTENANCE_WINDOW_ID).session(session ?? null).lean().exec() as OperationalMaintenanceWindowDocument | null;
  if (!current && !input.active) return emptyWindow();
  if (current?.active === input.active) return view(current);
  const updated = await OperationalMaintenanceWindowModel.findOneAndUpdate(
    { _id: OPERATIONAL_MAINTENANCE_WINDOW_ID, ...(current ? { active: current.active } : {}) },
    { $set: { active: input.active, reason: input.reason, actorId: input.actorId, ...(input.active ? { activatedAt: new Date(), deactivatedAt: null } : { deactivatedAt: new Date() }) }, $setOnInsert: { _id: OPERATIONAL_MAINTENANCE_WINDOW_ID, writeEpoch: 0 }, $inc: { revision: 1 } },
    { new: true, upsert: input.active, runValidators: true, session },
  ).lean().exec();
  return view(updated as OperationalMaintenanceWindowDocument | null);
}

export async function assertOperationalWritesOpen(session?: ClientSession): Promise<void> {
  try {
    const state = await OperationalMaintenanceWindowModel.findOneAndUpdate(
      { _id: OPERATIONAL_MAINTENANCE_WINDOW_ID, active: { $ne: true } },
      { $setOnInsert: { _id: OPERATIONAL_MAINTENANCE_WINDOW_ID, active: false, reason: '', actorId: 'system', revision: 0 }, $inc: { writeEpoch: 1 }, $set: { lastWriteAt: new Date() } },
      { new: true, upsert: true, runValidators: true, session },
    ).lean().exec() as OperationalMaintenanceWindowDocument | null;
    if (!state || state.active) throw new OperationalMaintenanceActiveError();
  } catch (error) {
    if (error instanceof OperationalMaintenanceActiveError || (error as { code?: number })?.code === 11000) throw new OperationalMaintenanceActiveError();
    throw error;
  }
}
