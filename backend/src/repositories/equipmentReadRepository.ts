import mongoose, { type ClientSession } from 'mongoose';
import { CallModel } from '../models/Call.js';
import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';
import { MovementModel } from '../models/Movement.js';
import { UnitModel } from '../models/Unit.js';
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

export interface DashboardCallStatus {
  status: string;
  label: string;
  count: number;
}

export interface DashboardMovementActivity {
  id: string;
  equipmentId: string;
  origin: UnitReference;
  destination: UnitReference;
  status: string;
  occurredAt: string;
}

export interface DashboardUnitSummary {
  unit: UnitReference;
  coverage: string;
  equipment: number;
  attention: number;
}

export interface DashboardResponse {
  unit: UnitReference;
  metrics: DashboardMetrics;
  situations: DashboardSituationSummary[];
  recentActivity: DashboardActivity[];
  unitSummaries?: DashboardUnitSummary[];
  callsByStatus?: DashboardCallStatus[];
  criticalCalls?: number;
  pendingMovements?: number;
  monitoredUnits?: number;
  recentMovements?: DashboardMovementActivity[];
}

export interface DashboardReadScope {
  unit: UnitReference;
  unitId: string | null;
  role?: 'unit_user' | 'ditel_admin';
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

const ATTENTION_SITUATIONS = ['inactive', 'lost', 'written_off'] as const;

function isAttentionSituation(situation: string): boolean {
  return (ATTENTION_SITUATIONS as readonly string[]).includes(situation);
}

async function readUnitSummaries(unitId?: string | null): Promise<DashboardUnitSummary[]> {
  const scopeFilter = unitId ? { 'unit.id': unitId } : {};
  const documents = await EquipmentModel.find(scopeFilter)
    .select({ 'unit.id': 1, 'unit.name': 1, 'unit.acronym': 1, situation: 1 })
    .lean()
    .exec();

  const byUnit = new Map<string, DashboardUnitSummary>();

  for (const document of documents) {
    const unit = document.unit as UnitReference;
    const existing = byUnit.get(unit.id) ?? {
      unit,
      coverage: '0%',
      equipment: 0,
      attention: 0,
    };
    existing.equipment += 1;
    if (isAttentionSituation(document.situation as string)) {
      existing.attention += 1;
    }
    byUnit.set(unit.id, existing);
  }

  const summaries = [...byUnit.values()];

  if (summaries.length === 0) {
    return [];
  }

  const total = summaries.reduce((sum, summary) => sum + summary.equipment, 0);

  return summaries
    .map((summary) => ({
      ...summary,
      coverage: `${Math.round((summary.equipment / total) * 100)}%`,
    }))
    .sort((left, right) => left.unit.name.localeCompare(right.unit.name) || left.unit.id.localeCompare(right.unit.id));
}

const CALL_STATUS_ORDER = ['Aberto', 'Em análise', 'Em atendimento', 'Aguardando informação', 'Resolvido', 'Encerrado'];

async function readCallsByStatus(unitId?: string | null): Promise<DashboardCallStatus[]> {
  const filter = unitId ? { 'unit.id': unitId } : {};
  const documents = await CallModel.find(filter).select({ status: 1 }).lean().exec();

  const countsByStatus = new Map<string, number>();

  for (const document of documents) {
    const status = document.status as string;
    countsByStatus.set(status, (countsByStatus.get(status) ?? 0) + 1);
  }

  return [...countsByStatus.entries()]
    .map(([status]) => ({ status, label: status, count: countsByStatus.get(status) ?? 0 }))
    .sort((left, right) => CALL_STATUS_ORDER.indexOf(left.status) - CALL_STATUS_ORDER.indexOf(right.status));
}

async function readCriticalCalls(unitId?: string | null): Promise<number> {
  const filter: Record<string, unknown> = { priority: 'Crítica' };
  if (unitId) {
    filter['unit.id'] = unitId;
  }
  return CallModel.countDocuments(filter).exec();
}

async function readPendingMovements(unitId?: string | null): Promise<number> {
  const filter: Record<string, unknown> = { status: 'Pendente' };
  if (unitId) {
    filter['origin.id'] = unitId;
  }
  return MovementModel.countDocuments(filter).exec();
}

async function readMonitoredUnits(unitId?: string | null): Promise<number> {
  const filter: Record<string, unknown> = {};
  if (unitId) {
    filter.id = unitId;
  }
  return UnitModel.countDocuments(filter).exec();
}

async function readRecentMovements(unitId?: string | null): Promise<DashboardMovementActivity[]> {
  const filter = unitId ? { 'origin.id': unitId } : {};
  const documents = await MovementModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(6)
    .lean()
    .exec();

  return documents.map((document) => ({
    id: String(document._id),
    equipmentId: document.equipmentId,
    origin: document.origin as UnitReference,
    destination: document.destination as UnitReference,
    status: document.status as string,
    occurredAt: new Date(document.createdAt).toISOString(),
  }));
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
    ...(scope.role === 'ditel_admin' ? { unitSummaries: await readUnitSummaries() } : { unitSummaries: await readUnitSummaries(scope.unitId) }),
    callsByStatus: await readCallsByStatus(scope.unitId),
    criticalCalls: await readCriticalCalls(scope.unitId),
    pendingMovements: await readPendingMovements(scope.unitId),
    monitoredUnits: await readMonitoredUnits(scope.unitId),
    recentMovements: await readRecentMovements(scope.unitId),
  };
}
