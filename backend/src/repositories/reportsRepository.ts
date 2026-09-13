import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';
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
