import type { ClientSession } from 'mongoose';

import { CallModel } from '../models/Call.js';
import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';
import { MAINTENANCE_STATUSES, MaintenanceModel, type MaintenanceStatus } from '../models/Maintenance.js';
import type { UnitReference } from '../models/User.js';

export interface MaintenanceFilters {
  status?: MaintenanceStatus;
  equipmentType?: string;
}

export interface MaintenanceScope {
  role: 'unit_user' | 'ditel_admin';
  unitId: string | null;
}

export interface MaintenanceCreateInput {
  equipmentId: string;
  description: string;
  status: MaintenanceStatus;
  type: string;
  unit: UnitReference;
  callId?: string;
}
export interface MaintenanceUpdateInput { maintenanceId: string; updatedAt: Date; status: MaintenanceStatus; diagnosis?: string; service?: string; technicalResponsible?: string; completedAt?: Date; observations?: string }

export interface MaintenanceEquipmentRecord {
  id: string;
  patrimony: string;
  type: string;
  model: string;
  brand: string;
  situation: EquipmentSituation;
}

export interface MaintenanceCallRecord {
  id: string;
  protocol: string;
  subject: string;
  equipmentId: string | null;
  unitId: string;
}

function filterFor(filters: MaintenanceFilters, scope: MaintenanceScope) {
  const filter: Record<string, unknown> = scope.role === 'unit_user' ? { 'unit.id': scope.unitId } : {};

  if (filters.status) {
    filter.status = filters.status;
  }

  if (filters.equipmentType) {
    filter['equipment.type'] = filters.equipmentType;
  }

  return filter;
}

function publicMaintenance(document: any) {
  const call = document.call
    ? { id: document.call.id, protocol: document.call.protocol, subject: document.call.subject }
    : undefined;

  return {
    id: String(document._id),
    equipment: {
      id: document.equipment.id,
      patrimony: document.equipment.patrimony,
      type: document.equipment.type,
      model: document.equipment.model,
      brand: document.equipment.brand,
    },
    unit: document.unit,
    status: document.status,
    type: document.type,
    description: document.description,
    ...(document.diagnosis ? { diagnosis: document.diagnosis } : {}),
    ...(document.service ? { service: document.service } : {}),
    ...(document.technicalResponsible ? { technicalResponsible: document.technicalResponsible } : {}),
    ...(document.completedAt ? { completedAt: new Date(document.completedAt).toISOString() } : {}),
    ...(document.observations ? { observations: document.observations } : {}),
    ...(call ? { call } : {}),
    openedAt: new Date(document.openedAt).toISOString(),
    updatedAt: new Date(document.updatedAt).toISOString(),
  };
}

export async function updateMaintenanceRecord(input: MaintenanceUpdateInput, session?: ClientSession) {
  const update: Record<string, unknown> = { status: input.status };
  for (const key of ['diagnosis', 'service', 'technicalResponsible', 'observations'] as const) if (input[key] !== undefined) update[key] = input[key];
  if (input.completedAt !== undefined) update.completedAt = input.completedAt;
  const query = MaintenanceModel.findOneAndUpdate({ _id: input.maintenanceId, updatedAt: input.updatedAt }, { $set: update }, { new: true }).select('+equipment +unit +status +type +description +call +openedAt +updatedAt +diagnosis +service +technicalResponsible +completedAt +observations');
  if (session) query.session(session);
  const document = await query.lean().exec();
  return document ? publicMaintenance(document) : null;
}

export function isMaintenanceStatus(value: string): value is MaintenanceStatus {
  return (MAINTENANCE_STATUSES as readonly string[]).includes(value);
}

export async function listMaintenanceRecords(filters: MaintenanceFilters, scope: MaintenanceScope) {
  const documents = await MaintenanceModel.find(filterFor(filters, scope))
    .select('equipment unit status type description call openedAt updatedAt')
    .sort({ updatedAt: -1, _id: -1 })
    .lean()
    .exec();

  return { items: documents.map(publicMaintenance) };
}

export async function findMaintenanceEquipment(
  equipmentId: string,
  unitId: string,
  session?: ClientSession,
): Promise<MaintenanceEquipmentRecord | null> {
  const query = EquipmentModel.findOne({ _id: equipmentId, 'unit.id': unitId })
    .select({ _id: 1, patrimony: 1, type: 1, model: 1, brand: 1, situation: 1 })
    .lean();
  if (session) query.session(session);
  const equipment = await query.exec();
  if (!equipment) return null;
  return {
    id: String(equipment._id),
    patrimony: equipment.patrimony,
    type: equipment.type,
    model: equipment.model,
    brand: equipment.brand,
    situation: equipment.situation as EquipmentSituation,
  };
}

export async function findMaintenanceCall(
  callId: string,
  unitId: string,
  equipmentId: string,
  session?: ClientSession,
): Promise<MaintenanceCallRecord | null> {
  const query = CallModel.findOne({ _id: callId, 'unit.id': unitId, equipmentId })
    .select({ _id: 1, protocol: 1, subject: 1, equipmentId: 1, unit: 1 })
    .lean();
  if (session) query.session(session);
  const call = await query.exec();
  if (!call) return null;
  return {
    id: String(call._id),
    protocol: call.protocol,
    subject: call.subject,
    equipmentId: call.equipmentId ?? null,
    unitId: call.unit.id,
  };
}

export async function createMaintenanceRecord(
  input: MaintenanceCreateInput,
  equipment: MaintenanceEquipmentRecord,
  call?: MaintenanceCallRecord,
  session?: ClientSession,
) {
  const [document] = await MaintenanceModel.create([{
    equipmentId: equipment.id,
    equipment: {
      id: equipment.id,
      patrimony: equipment.patrimony,
      type: equipment.type,
      model: equipment.model,
      brand: equipment.brand,
    },
    ...(call ? {
      callId: call.id,
      call: { id: call.id, protocol: call.protocol, subject: call.subject },
    } : {}),
    unit: input.unit,
    status: input.status,
    type: input.type,
    description: input.description,
    openedAt: new Date(),
  }], session ? { session } : undefined);

  return publicMaintenance(document.toObject());
}
