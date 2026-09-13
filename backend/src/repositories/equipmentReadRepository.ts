import mongoose, { type ClientSession } from 'mongoose';
import { CallModel } from '../models/Call.js';
import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';
import type { UnitReference } from '../models/User.js';
import { publicAttachment, type AttachmentMetadata } from '../services/attachments.js';

export interface InventoryFilters { search?: string; type?: string; model?: string; situation?: EquipmentSituation; unitId?: string }
export interface InventoryScope { role: 'unit_user' | 'ditel_admin'; unitId: string | null }
export interface EquipmentCreateInput { patrimony: string; type: string; model: string; brand: string; situation: EquipmentSituation; location: string; serialNumber?: string; category: string; warranty?: string; observations?: string; unit: UnitReference; createdBy: string; attachments?: AttachmentMetadata[] }
function filterFor(filters: InventoryFilters, scope: InventoryScope) {
  const filter: Record<string, unknown> = scope.role === 'unit_user' ? { 'unit.id': scope.unitId } : {};
  if (scope.role === 'ditel_admin' && filters.unitId) filter['unit.id'] = filters.unitId;
  if (filters.type) filter.type = filters.type;
  if (filters.model) filter.model = filters.model;
  if (filters.situation) filter.situation = filters.situation;
  if (filters.search) { const expression = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ patrimony: expression }, { type: expression }, { model: expression }, { brand: expression }]; }
  return filter;
}
function summary(document: any) { return { id: String(document._id), patrimony: document.patrimony, type: document.type, model: document.model, brand: document.brand, situation: document.situation, location: document.location, unitName: document.unit.name }; }
export async function createEquipment(input: EquipmentCreateInput, session?: ClientSession) { const [document] = await EquipmentModel.create([{ ...input, history: [{ id: `equipment-created-${Date.now()}`, description: 'Cadastro inicial', occurredAt: new Date() }] }], session ? { session } : undefined); return { ...summary(document), serialNumber: document.serialNumber, category: document.category, ...(document.warranty ? { warranty: document.warranty } : {}), ...(document.observations ? { observations: document.observations } : {}), createdAt: document.createdAt?.toISOString(), createdBy: document.createdBy, updatedAt: document.updatedAt?.toISOString(), updatedBy: document.updatedBy, allocation: { location: document.location }, history: document.history.map((entry: any) => ({ id: entry.id, description: entry.description, occurredAt: new Date(entry.occurredAt).toISOString() })), linkedCalls: [], documents: (document.attachments ?? []).map(publicAttachment) }; }
export async function readInventory(filters: InventoryFilters, scope: InventoryScope, page: number, pageSize: number) {
  const filter = filterFor(filters, scope);
  const [total, documents] = await Promise.all([EquipmentModel.countDocuments(filter).exec(), EquipmentModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec()]);
  return { items: documents.map(summary), total, page, pageSize };
}
export async function readEquipmentDetails(id: string, filters: InventoryFilters, scope: InventoryScope) {
  if (!mongoose.isValidObjectId(id)) return null;
  const document = await EquipmentModel.findOne({ ...filterFor(filters, scope), _id: id }).lean().exec();
  if (!document) return null;
  const linkedCalls = await CallModel.find({ equipmentId: String(document._id) }).sort({ createdAt: -1, _id: -1 }).lean().exec();
  return {
    ...summary(document),
    ...(document.serialNumber ? { serialNumber: document.serialNumber } : {}),
    category: document.category ?? '',
    ...(document.warranty ? { warranty: document.warranty } : {}),
    ...(document.observations ? { observations: document.observations } : {}),
    ...(document.createdAt ? { createdAt: new Date(document.createdAt).toISOString() } : {}),
    ...(document.createdBy ? { createdBy: document.createdBy } : {}),
    ...(document.updatedAt ? { updatedAt: new Date(document.updatedAt).toISOString() } : {}),
    ...(document.updatedBy ? { updatedBy: document.updatedBy } : {}),
    allocation: { location: document.location },
    history: (document.history ?? []).map((entry: any) => ({
      id: entry.id,
      description: entry.description,
      occurredAt: new Date(entry.occurredAt).toISOString(),
    })),
    linkedCalls: linkedCalls.map((call) => ({
      id: String(call._id),
      subject: call.subject,
      status: call.status,
      openedAt: new Date(call.createdAt).toISOString(),
    })),
    documents: (document.attachments ?? []).map(publicAttachment),
  };
}

export interface DashboardMetrics {
  total: number;
  active: number;
  maintenance: number;
  attention: number;
}

export interface DashboardSituationSummary {
  situation: 'active' | 'maintenance' | 'attention';
  label: string;
  count: number;
}

export interface DashboardActivity {
  id: string;
  description: string;
  occurredAt: string;
}

export interface DashboardResponse {
  unit: UnitReference;
  metrics: DashboardMetrics;
  situations: DashboardSituationSummary[];
  recentActivity: DashboardActivity[];
}

export interface DashboardReadScope {
  unit: UnitReference;
  unitId: string | null;
}

function buildEquipmentFilter(unitId: string | null) {
  return unitId ? { 'unit.id': unitId } : {};
}

function labelForSituation(situation: DashboardSituationSummary['situation']): string {
  switch (situation) {
    case 'active':
      return 'Em operação';
    case 'maintenance':
      return 'Em manutenção';
    case 'attention':
      return 'Requer atenção';
  }
}

async function countBySituation(
  filter: ReturnType<typeof buildEquipmentFilter>,
  situation: EquipmentSituation,
): Promise<number> {
  return EquipmentModel.countDocuments({
    ...filter,
    situation,
  }).exec();
}

export interface EquipmentSituationInput {
  equipmentId: string;
  situation: EquipmentSituation;
  updatedAt: Date;
  updatedBy: string;
}

export interface EquipmentAuditRecord {
  id: string;
  patrimony: string;
  unit: UnitReference;
  situation: EquipmentSituation;
  updatedAt: Date;
}

export async function findEquipmentAuditRecord(id: string, scope: InventoryScope | null, session?: ClientSession): Promise<EquipmentAuditRecord | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  const scopeFilter = scope && scope.role === 'unit_user' ? { 'unit.id': scope.unitId } : {};
  const document = await EquipmentModel.findOne({ _id: id, ...scopeFilter }).session(session ?? null).lean().exec();
  if (!document) return null;
  return {
    id: String(document._id),
    patrimony: document.patrimony,
    unit: document.unit as UnitReference,
    situation: document.situation as EquipmentSituation,
    updatedAt: document.updatedAt as Date,
  };
}

export async function updateEquipmentSituation(
  input: EquipmentSituationInput,
  scope: InventoryScope,
  session?: ClientSession,
) {
  const scopeFilter = scope.role === 'unit_user' ? { 'unit.id': scope.unitId } : {};
  const previous = await EquipmentModel.findOne({ _id: input.equipmentId, ...scopeFilter }).session(session ?? null).lean().exec();
  if (!previous) return null;
  const document = await EquipmentModel.findOneAndUpdate(
    { _id: input.equipmentId, ...scopeFilter, updatedAt: input.updatedAt },
    {
      $set: {
        situation: input.situation,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
        ...({} as Record<string, never>),
      },
      $push: {
        history: {
          id: `equipment-situation-${Date.now()}`,
          description: `Situação alterada: ${previous.situation} → ${input.situation}.`,
          occurredAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true, ...(session ? { session } : {}) },
  ).lean().exec();

  if (!document) return null;
  return {
    id: String(document._id),
    patrimony: document.patrimony,
    situation: document.situation,
    unitName: document.unit?.name,
    updatedBy: document.updatedBy,
    updatedAt: document.updatedAt,
  };
}

export async function readDashboardByScope(scope: DashboardReadScope): Promise<DashboardResponse> {
  const filter = buildEquipmentFilter(scope.unitId);
  const [total, active, maintenance, inactive, lost, writtenOff] = await Promise.all([
    EquipmentModel.countDocuments(filter).exec(),
    countBySituation(filter, 'active'),
    countBySituation(filter, 'maintenance'),
    countBySituation(filter, 'inactive'),
    countBySituation(filter, 'lost'),
    countBySituation(filter, 'written_off'),
  ]);

  const attention = inactive + lost + writtenOff;

  return {
    unit: scope.unit,
    metrics: {
      total,
      active,
      maintenance,
      attention,
    },
    situations: [
      {
        situation: 'active',
        label: labelForSituation('active'),
        count: active,
      },
      {
        situation: 'maintenance',
        label: labelForSituation('maintenance'),
        count: maintenance,
      },
      {
        situation: 'attention',
        label: labelForSituation('attention'),
        count: attention,
      },
    ],
    recentActivity: [],
  };
}
