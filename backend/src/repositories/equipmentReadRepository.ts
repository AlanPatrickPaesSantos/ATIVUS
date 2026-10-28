import mongoose, { type ClientSession } from 'mongoose';
import { CallModel } from '../models/Call.js';
import { EquipmentModel, type EquipmentCustody, type EquipmentSituation, unitEquipmentCustody } from '../models/Equipment.js';
import { MovementModel } from '../models/Movement.js';
import { UnitModel } from '../models/Unit.js';
import type { UnitReference } from '../models/User.js';
import { publicAttachment, type AttachmentMetadata } from '../services/attachments.js';
import { ATTENTION_SITUATIONS, buildScopedEquipmentQuery, periodRange, type EquipmentFilterInput, unitReference } from './equipmentQueryFilters.js';
import { descendantUnitIds } from './organizationalScopeResolver.js';

export interface InventoryFilters extends Omit<EquipmentFilterInput, 'situation'> { situation?: EquipmentSituation }
export interface InventoryScope { role: 'unit_user' | 'ditel_admin'; unitId: string | null }
export interface EquipmentCreateInput { patrimony: string; type: string; model: string; brand: string; situation: EquipmentSituation; location: string; section?: string; serialNumber?: string; category: string; warranty?: string; observations?: string; unit: UnitReference | null; custody?: EquipmentCustody; createdBy: string; attachments?: AttachmentMetadata[] }
function filterFor(filters: InventoryFilters, scope: InventoryScope) { return buildScopedEquipmentQuery(filters, scope); }
function summary(document: any) { return { id: String(document._id), patrimony: document.patrimony, type: document.type, model: document.model, brand: document.brand, situation: document.situation, location: document.location, unitName: document.unit?.name ?? null }; }
export async function createEquipment(input: EquipmentCreateInput, session?: ClientSession) { const [document] = await EquipmentModel.create([{ ...input, ...(input.custody || input.unit === null ? {} : { custody: unitEquipmentCustody(input.unit) }), history: [{ id: `equipment-created-${Date.now()}`, description: 'Cadastro inicial', occurredAt: new Date() }] }], session ? { session } : undefined); return { ...summary(document), serialNumber: document.serialNumber, category: document.category, ...(document.warranty ? { warranty: document.warranty } : {}), ...(document.observations ? { observations: document.observations } : {}), createdAt: document.createdAt?.toISOString(), createdBy: document.createdBy, updatedAt: document.updatedAt?.toISOString(), updatedBy: document.updatedBy, allocation: { location: document.location }, history: document.history.map((entry: any) => ({ id: entry.id, description: entry.description, occurredAt: new Date(entry.occurredAt).toISOString() })), linkedCalls: [], documents: (document.attachments ?? []).map(publicAttachment) }; }
export async function readInventory(filters: InventoryFilters, scope: InventoryScope, page: number, pageSize: number) {
  const { filter } = await filterFor(filters, scope);
  const [total, documents] = await Promise.all([EquipmentModel.countDocuments(filter).exec(), EquipmentModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec()]);
  return { items: documents.map(summary), total, page, pageSize };
}

export interface InventoryFacets {
  units: UnitReference[];
  types: string[];
  models: string[];
  situations: EquipmentSituation[];
  municipalities: string[];
  regions: string[];
  sections: string[];
}

export async function readInventoryFacets(filters: InventoryFilters = {}, scope: InventoryScope): Promise<InventoryFacets> {
  const { filter, unitIds } = await filterFor(filters, scope);
  const unitFilter = unitIds === null ? { active: true } : { id: { $in: unitIds }, active: true };
  const units = await UnitModel.find(unitFilter).select({ id: 1, name: 1, acronym: 1, municipality: 1, region: 1, _id: 0 }).sort({ name: 1, id: 1 }).lean().exec();
  const equipmentUnitIds = units.map((unit) => unit.id);
  const scopedFilter = { ...filter, 'unit.id': { $in: equipmentUnitIds } };
  const [types, models, situations, sections] = await Promise.all([
    EquipmentModel.distinct('type', scopedFilter),
    EquipmentModel.distinct('model', scopedFilter),
    EquipmentModel.distinct('situation', scopedFilter),
    EquipmentModel.distinct('section', { ...scopedFilter, section: { $type: 'string', $ne: '' } }),
  ]);
  return {
    units: units.map(unitReference),
    types: types.filter((value): value is string => typeof value === 'string').sort(),
    models: models.filter((value): value is string => typeof value === 'string').sort(),
    situations: situations.filter((value): value is EquipmentSituation => typeof value === 'string').sort() as EquipmentSituation[],
    municipalities: [...new Set(units.map((unit) => unit.municipality).filter((value): value is string => Boolean(value)))].sort(),
    regions: [...new Set(units.map((unit) => unit.region).filter((value): value is string => Boolean(value)))].sort(),
    sections: sections.filter((value): value is string => typeof value === 'string').sort(),
  };
}
export async function readEquipmentDetails(id: string, filters: InventoryFilters, scope: InventoryScope) {
  if (!mongoose.isValidObjectId(id)) return null;
  const { filter } = await filterFor(filters, scope);
  const document = await EquipmentModel.findOne({ ...filter, _id: id }).lean().exec();
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
  situation: 'active' | 'maintenance' | 'inactive' | 'attention';
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
  equipmentShare: string;
  patrimonialCoverage: null;
  equipment: number;
  attention: number;
  organizationType: 'intermediate_command' | 'subordinate_unit';
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
  operationalIndicators: DashboardOperationalIndicators;
  commandSummaries: DashboardCommandSummary[];
}

export interface DashboardOperationalIndicators {
  total: number;
  active: number;
  maintenance: number;
  inactive: number;
  lost: number;
  writtenOff: number;
  attention: number;
  attentionPercent: number;
}

export interface DashboardCommandSummary {
  command: UnitReference;
  equipment: number;
  attention: number;
  attentionPercent: number;
}

export interface DashboardReadScope {
  unit: UnitReference;
  unitId: string | null;
  role?: 'unit_user' | 'ditel_admin';
}

function labelForSituation(situation: DashboardSituationSummary['situation']): string {
  switch (situation) {
    case 'active':
      return 'Em operação';
    case 'maintenance':
      return 'Em manutenção';
    case 'inactive':
      return 'Inativos';
    case 'attention':
      return 'Requer atenção';
  }
}

async function readUnitSummaries(
  equipmentFilter: Record<string, unknown>,
  unitIds: string[] | null,
): Promise<DashboardUnitSummary[]> {
  const unitFilter = unitIds === null ? { active: true } : { id: { $in: unitIds }, active: true };
  const [units, grouped] = await Promise.all([
    UnitModel.find(unitFilter).select({ id: 1, name: 1, acronym: 1, kind: 1, _id: 0 }).lean().exec(),
    EquipmentModel.aggregate([
      { $match: equipmentFilter },
      { $group: { _id: '$unit.id', equipment: { $sum: 1 }, attention: { $sum: { $cond: [{ $in: ['$situation', [...ATTENTION_SITUATIONS]] }, 1, 0] } } } },
    ]).exec(),
  ]);
  const counts = new Map(grouped.map((item) => [String(item._id), { equipment: Number(item.equipment), attention: Number(item.attention) }]));
  const total = grouped.reduce((sum, item) => sum + Number(item.equipment), 0);
  return units.map((unit) => {
    const count = counts.get(unit.id) ?? { equipment: 0, attention: 0 };
    const share = total > 0 ? `${Math.round((count.equipment / total) * 100)}%` : '0%';
    const organizationType: DashboardUnitSummary['organizationType'] = unit.kind === 'intermediate_command' ? 'intermediate_command' : 'subordinate_unit';
    return {
      unit: unitReference(unit),
      coverage: share,
      equipmentShare: share,
      patrimonialCoverage: null,
      equipment: count.equipment,
      attention: count.attention,
      organizationType,
    };
  }).sort((left, right) => left.unit.name.localeCompare(right.unit.name) || left.unit.id.localeCompare(right.unit.id));
}

async function readCommandSummaries(
  equipmentFilter: Record<string, unknown>,
  unitIds: string[] | null,
  commandId?: string,
): Promise<DashboardCommandSummary[]> {
  const organizations = await UnitModel.find({ active: true })
    .select({ id: 1, name: 1, acronym: 1, parentUnitId: 1, kind: 1, _id: 0 })
    .lean()
    .exec();
  const organizationalUnits = organizations.map((unit) => ({
    ...unit,
    kind: unit.kind ?? 'other',
    active: Boolean(unit.active),
    parentUnitId: unit.parentUnitId ?? null,
  }));
  const commands = organizationalUnits.filter((unit) => unit.kind === 'intermediate_command' && (!commandId || unit.id === commandId));
  const grouped = await EquipmentModel.aggregate([
    { $match: equipmentFilter },
    { $group: { _id: '$unit.id', equipment: { $sum: 1 }, attention: { $sum: { $cond: [{ $in: ['$situation', [...ATTENTION_SITUATIONS]] }, 1, 0] } } } },
  ]).exec();
  const counts = new Map(grouped.map((item) => [String(item._id), { equipment: Number(item.equipment), attention: Number(item.attention) }]));
  const allowed = unitIds === null ? null : new Set(unitIds);

  return commands
    .map((command) => {
      const descendants = descendantUnitIds(organizationalUnits, command.id).filter((id) => allowed === null || allowed.has(id));
      const totals = descendants.reduce((result, id) => {
        const count = counts.get(id);
        return { equipment: result.equipment + (count?.equipment ?? 0), attention: result.attention + (count?.attention ?? 0) };
      }, { equipment: 0, attention: 0 });
      return {
        command: unitReference(command),
        equipment: totals.equipment,
        attention: totals.attention,
        attentionPercent: totals.equipment > 0 ? Math.round((totals.attention / totals.equipment) * 100) : 0,
      };
    })
    .sort((left, right) => left.command.name.localeCompare(right.command.name) || left.command.id.localeCompare(right.command.id));
}

const CALL_STATUS_ORDER = ['Aberto', 'Em análise', 'Em atendimento', 'Aguardando informação', 'Resolvido', 'Encerrado'];

async function readCallsByStatus(filter: Record<string, unknown>): Promise<DashboardCallStatus[]> {
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

async function readCriticalCalls(baseFilter: Record<string, unknown>): Promise<number> {
  const filter: Record<string, unknown> = { ...baseFilter, priority: 'Crítica' };
  return CallModel.countDocuments(filter).exec();
}

async function readRecentActivity(filter: Record<string, unknown>): Promise<DashboardActivity[]> {
  const documents = await CallModel.find(filter)
    .select({ protocol: 1, status: 1, updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .limit(6)
    .lean()
    .exec();

  return documents.map((document) => ({
    id: String(document._id),
    description: `Chamado ${document.status}: ${document.protocol}`,
    occurredAt: new Date(document.updatedAt ?? document.createdAt).toISOString(),
  }));
}

async function readPendingMovements(unitIds: string[] | null, period: EquipmentFilterInput['period']): Promise<number> {
  const filter: Record<string, unknown> = { status: 'Pendente' };
  if (unitIds !== null) filter['origin.id'] = { $in: unitIds };
  const createdAt = periodRange(period);
  if (createdAt) filter.createdAt = createdAt;
  return MovementModel.countDocuments(filter).exec();
}

async function readMonitoredUnits(unitIds: string[] | null): Promise<number> {
  const filter: Record<string, unknown> = { active: true, kind: { $ne: 'intermediate_command' } };
  if (unitIds !== null) filter.id = { $in: unitIds };
  return UnitModel.countDocuments(filter).exec();
}

async function readRecentMovements(unitIds: string[] | null, period: EquipmentFilterInput['period']): Promise<DashboardMovementActivity[]> {
  const filter: Record<string, unknown> = {};
  if (unitIds !== null) filter['origin.id'] = { $in: unitIds };
  const createdAt = periodRange(period);
  if (createdAt) filter.createdAt = createdAt;
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
  filter: Record<string, unknown>,
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
  unit: UnitReference | null;
  situation: EquipmentSituation;
  updatedAt: Date;
}

export async function findEquipmentAuditRecord(id: string, scope: InventoryScope | null, session?: ClientSession): Promise<EquipmentAuditRecord | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  const scopeFilter = scope?.role === 'unit_user' ? { 'unit.id': scope.unitId, 'custody.scope': { $ne: 'AC' } } : { 'custody.scope': { $ne: 'AC' } };
  const document = await EquipmentModel.findOne({ _id: id, ...scopeFilter }).session(session ?? null).lean().exec();
  if (!document) return null;
  return {
    id: String(document._id),
    patrimony: document.patrimony,
    unit: (document.unit as UnitReference | null) ?? null,
    situation: document.situation as EquipmentSituation,
    updatedAt: document.updatedAt as Date,
  };
}

export async function updateEquipmentSituation(
  input: EquipmentSituationInput,
  scope: InventoryScope,
  session?: ClientSession,
) {
  const scopeFilter = scope.role === 'unit_user' ? { 'unit.id': scope.unitId, 'custody.scope': { $ne: 'AC' } } : { 'custody.scope': { $ne: 'AC' } };
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

export async function readDashboardByScope(scope: DashboardReadScope, filters: EquipmentFilterInput = {}): Promise<DashboardResponse> {
  const { filter, unitIds } = await buildScopedEquipmentQuery(filters, { role: scope.role ?? 'ditel_admin', unitId: scope.unitId });
  const activityFilter: Record<string, unknown> = {};
  if (unitIds !== null) activityFilter['unit.id'] = { $in: unitIds };
  if (filters.section) activityFilter.section = filters.section;
  const createdAt = periodRange(filters.period);
  if (createdAt) activityFilter.createdAt = createdAt;
  const movementUnitIds = unitIds;
  const [total, active, maintenance, inactive, lost, writtenOff] = await Promise.all([
    EquipmentModel.countDocuments(filter).exec(),
    countBySituation(filter, 'active'),
    countBySituation(filter, 'maintenance'),
    countBySituation(filter, 'inactive'),
    countBySituation(filter, 'lost'),
    countBySituation(filter, 'written_off'),
  ]);

  const attention = lost + writtenOff;
  const operationalIndicators: DashboardOperationalIndicators = {
    total,
    active,
    maintenance,
    inactive,
    lost,
    writtenOff,
    attention,
    attentionPercent: total > 0 ? Math.round((attention / total) * 100) : 0,
  };

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
        situation: 'inactive',
        label: labelForSituation('inactive'),
        count: inactive,
      },
      {
        situation: 'attention',
        label: labelForSituation('attention'),
        count: attention,
      },
    ],
    recentActivity: await readRecentActivity(activityFilter),
    unitSummaries: await readUnitSummaries(filter, unitIds),
    operationalIndicators,
    commandSummaries: scope.role === 'ditel_admin' ? await readCommandSummaries(filter, unitIds, filters.commandId) : [],
    callsByStatus: await readCallsByStatus(activityFilter),
    criticalCalls: await readCriticalCalls(activityFilter),
    pendingMovements: await readPendingMovements(movementUnitIds, filters.period),
    monitoredUnits: await readMonitoredUnits(unitIds),
    recentMovements: await readRecentMovements(movementUnitIds, filters.period),
  };
}
