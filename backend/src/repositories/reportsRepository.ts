import { CallModel, CALL_PRIORITIES } from '../models/Call.js';
import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';
import { MovementModel, MOVEMENT_STATUSES } from '../models/Movement.js';
import type { UnitReference } from '../models/User.js';

export const REPORT_SITUATIONS = ['active', 'maintenance', 'inactive', 'lost', 'written_off'] as const satisfies EquipmentSituation[];

export type InventoryReportSituation = typeof REPORT_SITUATIONS[number];

export interface InventoryReportScope {
  role: 'unit_user' | 'ditel_admin';
  unitId: string | null;
}

export interface InventoryReportFilters {
  unitId?: string;
  situation?: InventoryReportSituation;
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
  counters.total += 1;

  if (situation === 'written_off') {
    counters.writtenOff += 1;
  } else {
    counters[situation] += 1;
  }

  if (['inactive', 'lost', 'written_off'].includes(situation)) {
    counters.attention += 1;
  }
}

function filterFor(filters: InventoryReportFilters, scope: InventoryReportScope) {
  const filter: Record<string, unknown> = scope.role === 'unit_user' ? { 'unit.id': scope.unitId } : {};

  if (scope.role === 'ditel_admin' && filters.unitId) {
    filter['unit.id'] = filters.unitId;
  }

  if (filters.situation) {
    filter.situation = filters.situation;
  }

  if (filters.period) {
    filter.createdAt = periodCreatedAtRange(filters.period);
  }

  return filter;
}

export async function readInventoryReport(
  filters: InventoryReportFilters,
  scope: InventoryReportScope,
): Promise<InventoryReport> {
  const documents = await EquipmentModel.find(filterFor(filters, scope))
    .select('unit situation')
    .sort({ 'unit.name': 1, 'unit.id': 1, createdAt: -1, _id: 1 })
    .lean()
    .exec();

  const totals = emptyCounters();
  const byUnit = new Map<string, InventoryReportUnitSummary>();

  for (const document of documents) {
    const unit = document.unit as UnitReference;
    const existing = byUnit.get(unit.id) ?? { unit, ...emptyCounters() };

    increment(totals, document.situation as EquipmentSituation);
    increment(existing, document.situation as EquipmentSituation);
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

function callsFilterFor(filters: InventoryReportFilters, scope: InventoryReportScope) {
  const filter: Record<string, unknown> = scope.role === 'unit_user' ? { 'unit.id': scope.unitId } : {};

  if (scope.role === 'ditel_admin' && filters.unitId) {
    filter['unit.id'] = filters.unitId;
  }

  return filter;
}

export async function readCallsReport(
  filters: InventoryReportFilters,
  scope: InventoryReportScope,
): Promise<CallsReport> {
  const documents = await CallModel.find(callsFilterFor(filters, scope))
    .select('status priority')
    .lean()
    .exec();

  const totals = emptyCallsCounters();
  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();

  for (const document of documents) {
    totals.total += 1;

    if (document.status === 'Aberto') totals.open += 1;
    if (document.status === 'Aberto' || document.status === 'Em atendimento' || document.status === 'Aguardando informação') totals.attention += 1;
    if (document.status === 'Resolvido' || document.status === 'Encerrado') totals.resolved += 1;
    if (document.priority === 'Crítica') totals.critical += 1;

    byStatus.set(document.status, (byStatus.get(document.status) ?? 0) + 1);
    byPriority.set(document.priority, (byPriority.get(document.priority) ?? 0) + 1);
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

function movementsFilterFor(filters: InventoryReportFilters, scope: InventoryReportScope) {
  const filter: Record<string, unknown> = {};

  const unitIds = scope.role === 'unit_user'
    ? [scope.unitId]
    : filters.unitId ? [filters.unitId] : null;

  if (unitIds) {
    filter.$or = [{ 'origin.id': { $in: unitIds } }, { 'destination.id': { $in: unitIds } }];
  }

  return filter;
}

export async function readMovementsReport(
  filters: InventoryReportFilters,
  scope: InventoryReportScope,
): Promise<MovementsReport> {
  const documents = await MovementModel.find(movementsFilterFor(filters, scope))
    .select('status')
    .lean()
    .exec();

  const totals = emptyMovementsCounters();
  const byStatus = new Map<string, number>();

  for (const document of documents) {
    totals.total += 1;

    if (document.status === 'Pendente') totals.pending += 1;
    if (document.status === 'Aprovada') totals.approved += 1;
    if (document.status === 'Rejeitada') totals.rejected += 1;

    byStatus.set(document.status, (byStatus.get(document.status) ?? 0) + 1);
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
