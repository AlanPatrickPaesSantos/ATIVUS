import { CallModel, CALL_PRIORITIES } from '../models/Call.js';
import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';
import { MovementModel, MOVEMENT_STATUSES } from '../models/Movement.js';
import type { UnitReference } from '../models/User.js';
import { ATTENTION_SITUATIONS, resolveScopedUnitIds } from './equipmentQueryFilters.js';

export const REPORT_SITUATIONS = ['active', 'maintenance', 'inactive', 'lost', 'written_off'] as const satisfies EquipmentSituation[];

export type InventoryReportSituation = typeof REPORT_SITUATIONS[number];

export interface InventoryReportScope {
  role: 'unit_user' | 'ditel_admin';
  unitId: string | null;
}

export interface InventoryReportFilters {
  unitId?: string;
  commandId?: string;
  situation?: InventoryReportSituation;
  from?: string;
  to?: string;
  period?: InventoryReportPeriod;
}

export const REPORT_PERIODS = ['july_2026', 'q2_2026'] as const;

export type InventoryReportPeriod = typeof REPORT_PERIODS[number];

function periodCreatedAtRange(period: InventoryReportPeriod): { $gte: Date; $lt: Date } {
  const start = new Date(Date.UTC(2026, 3, 1));
  const end = new Date(Date.UTC(2026, 6, 1));

  if (period === 'july_2026') {
    return { $gte: new Date(Date.UTC(2026, 6, 1)), $lt: new Date(Date.UTC(2026, 7, 1)) };
  }

  return { $gte: start, $lt: end };
}

function realDateRange(filters: InventoryReportFilters): { $gte: Date; $lte: Date } | undefined {
  if (!filters.from && !filters.to) return undefined;
  return {
    $gte: new Date(`${filters.from ?? '1970-01-01'}T00:00:00.000Z`),
    $lte: new Date(`${filters.to ?? '9999-12-31'}T23:59:59.999Z`),
  };
}

export interface InventoryReportCounters {
  total: number;
  active: number;
  maintenance: number;
  inactive: number;
  lost: number;
  writtenOff: number;
  attention: number;
}

export interface InventoryReportUnitSummary extends InventoryReportCounters {
  unit: UnitReference;
}

export interface InventoryReport {
  totals: InventoryReportCounters;
  units: InventoryReportUnitSummary[];
}

function emptyCounters(): InventoryReportCounters {
  return {
    total: 0,
    active: 0,
    maintenance: 0,
    inactive: 0,
    lost: 0,
    writtenOff: 0,
    attention: 0,
  };
}

function increment(counters: InventoryReportCounters, situation: EquipmentSituation) {
  incrementByCount(counters, situation, 1);
}

function incrementByCount(counters: InventoryReportCounters, situation: EquipmentSituation, count: number) {
  counters.total += count;

  if (situation === 'written_off') {
    counters.writtenOff += count;
  } else {
    counters[situation] += count;
  }

  if (ATTENTION_SITUATIONS.includes(situation as typeof ATTENTION_SITUATIONS[number])) {
    counters.attention += count;
  }
}

async function filterFor(filters: InventoryReportFilters, scope: InventoryReportScope) {
  const filter: Record<string, unknown> = { 'custody.scope': { $ne: 'AC' } };
  const unitIds = await resolveScopedUnitIds({ commandId: scope.role === 'ditel_admin' ? filters.commandId : undefined, unitId: scope.role === 'ditel_admin' ? filters.unitId : undefined }, scope);
  if (unitIds !== null) filter['unit.id'] = { $in: unitIds };

  if (filters.situation) {
    filter.situation = filters.situation;
  }

  if (filters.from || filters.to) {
    filter.createdAt = realDateRange(filters);
  } else if (filters.period) {
    filter.createdAt = periodCreatedAtRange(filters.period);
  }

  return filter;
}

export async function readInventoryReport(
  filters: InventoryReportFilters,
  scope: InventoryReportScope,
): Promise<InventoryReport> {
  const totals = emptyCounters();
  const byUnit = new Map<string, InventoryReportUnitSummary>();
  const groups = await EquipmentModel.aggregate<{ _id: { unit: UnitReference; situation: EquipmentSituation }; count: number }>([
    { $match: await filterFor(filters, scope) },
    { $group: { _id: { unit: '$unit', situation: '$situation' }, count: { $sum: 1 } } },
    { $sort: { '_id.unit.name': 1, '_id.unit.id': 1, '_id.situation': 1 } },
  ]).exec();

  for (const group of groups) {
    const unit = group._id.unit;
    const existing = byUnit.get(unit.id) ?? { unit, ...emptyCounters() };
    incrementByCount(totals, group._id.situation, group.count);
    incrementByCount(existing, group._id.situation, group.count);
    byUnit.set(unit.id, existing);
  }

  return {
    totals,
    units: [...byUnit.values()].sort((left, right) => left.unit.name.localeCompare(right.unit.name) || left.unit.id.localeCompare(right.unit.id)),
  };
}

const CALL_REPORT_STATUSES = ['Aberto', 'Em análise', 'Em atendimento', 'Aguardando informação', 'Resolvido', 'Encerrado'] as const;

export interface CallsReportCounters {
  total: number;
  open: number;
  critical: number;
  attention: number;
  resolved: number;
}

export interface CallsReportStatusGroup {
  status: string;
  count: number;
}

export interface CallsReportPriorityGroup {
  priority: string;
  count: number;
}

export interface CallsReport {
  totals: CallsReportCounters;
  byStatus: CallsReportStatusGroup[];
  byPriority: CallsReportPriorityGroup[];
}

function emptyCallsCounters(): CallsReportCounters {
  return { total: 0, open: 0, critical: 0, attention: 0, resolved: 0 };
}

async function callsFilterFor(filters: InventoryReportFilters, scope: InventoryReportScope) {
  const unitIds = await resolveScopedUnitIds({ commandId: scope.role === 'ditel_admin' ? filters.commandId : undefined, unitId: scope.role === 'ditel_admin' ? filters.unitId : undefined }, scope);
  const filter: Record<string, unknown> = unitIds === null ? {} : { 'unit.id': { $in: unitIds } };
  const dates = realDateRange(filters);
  if (dates) filter.createdAt = dates;
  return filter;
}

export async function readCallsReport(
  filters: InventoryReportFilters,
  scope: InventoryReportScope,
): Promise<CallsReport> {
  const totals = emptyCallsCounters();
  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();
  const groups = await CallModel.aggregate<{ _id: { status: string; priority: string }; count: number }>([
    { $match: await callsFilterFor(filters, scope) },
    { $group: { _id: { status: '$status', priority: '$priority' }, count: { $sum: 1 } } },
  ]).exec();

  for (const group of groups) {
    const { status, priority } = group._id;
    totals.total += group.count;
    if (status === 'Aberto') totals.open += group.count;
    if (status === 'Aberto' || status === 'Em atendimento' || status === 'Aguardando informação') totals.attention += group.count;
    if (status === 'Resolvido' || status === 'Encerrado') totals.resolved += group.count;
    if (priority === 'Crítica') totals.critical += group.count;
    byStatus.set(status, (byStatus.get(status) ?? 0) + group.count);
    byPriority.set(priority, (byPriority.get(priority) ?? 0) + group.count);
  }

  return {
    totals,
    byStatus: CALL_REPORT_STATUSES
      .filter((status) => byStatus.has(status))
      .map((status) => ({ status, count: byStatus.get(status)! })),
    byPriority: CALL_PRIORITIES
      .filter((priority) => byPriority.has(priority))
      .map((priority) => ({ priority, count: byPriority.get(priority)! })),
  };
}

export interface MovementsReportCounters {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface MovementsReport {
  totals: MovementsReportCounters;
  byStatus: Array<{ status: string; count: number }>;
}

function emptyMovementsCounters(): MovementsReportCounters {
  return { total: 0, pending: 0, approved: 0, rejected: 0 };
}

async function movementsFilterFor(filters: InventoryReportFilters, scope: InventoryReportScope) {
  const filter: Record<string, unknown> = {};
  const unitIds = await resolveScopedUnitIds({ commandId: scope.role === 'ditel_admin' ? filters.commandId : undefined, unitId: scope.role === 'ditel_admin' ? filters.unitId : undefined }, scope);

  if (unitIds) {
    filter.$or = [{ 'origin.id': { $in: unitIds } }, { 'destination.id': { $in: unitIds } }];
  }

  const dates = realDateRange(filters);
  if (dates) filter.createdAt = dates;

  return filter;
}

export async function readMovementsReport(
  filters: InventoryReportFilters,
  scope: InventoryReportScope,
): Promise<MovementsReport> {
  const totals = emptyMovementsCounters();
  const byStatus = new Map<string, number>();
  const groups = await MovementModel.aggregate<{ _id: string; count: number }>([
    { $match: await movementsFilterFor(filters, scope) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).exec();

  for (const group of groups) {
    totals.total += group.count;
    if (group._id === 'Pendente') totals.pending += group.count;
    if (group._id === 'Aprovada') totals.approved += group.count;
    if (group._id === 'Rejeitada') totals.rejected += group.count;
    byStatus.set(group._id, group.count);
  }

  return {
    totals,
    byStatus: MOVEMENT_STATUSES
      .filter((status) => byStatus.has(status))
      .map((status) => ({ status, count: byStatus.get(status)! })),
  };
}

export interface GeneralReport {
  inventory: InventoryReport;
  calls: CallsReport;
  movements: MovementsReport;
}

export async function readGeneralReport(
  filters: InventoryReportFilters,
  scope: InventoryReportScope,
): Promise<GeneralReport> {
  const [inventory, calls, movements] = await Promise.all([
    readInventoryReport(filters, scope),
    readCallsReport(filters, scope),
    readMovementsReport(filters, scope),
  ]);

  return { inventory, calls, movements };
}
