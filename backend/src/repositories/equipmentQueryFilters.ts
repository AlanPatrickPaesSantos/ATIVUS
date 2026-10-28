import type { FilterQuery } from 'mongoose';

import { UnitModel } from '../models/Unit.js';
import type { EquipmentDocument, EquipmentSituation } from '../models/Equipment.js';
import type { UnitReference } from '../models/User.js';
import { resolveOrganizationalScopeFromDatabase } from './organizationalScopeResolver.js';

export type DashboardPeriod = '30d' | '90d' | '2026-08';
export const ATTENTION_SITUATIONS = ['lost', 'written_off'] as const satisfies EquipmentSituation[];

export interface EquipmentFilterInput {
  search?: string;
  type?: string;
  model?: string;
  situation?: EquipmentSituation | 'attention';
  unitId?: string;
  commandId?: string;
  municipality?: string;
  region?: string;
  section?: string;
  period?: DashboardPeriod;
}

export interface ScopedEquipmentQuery {
  filter: FilterQuery<EquipmentDocument>;
  unitIds: string[] | null;
}

export function periodRange(period: DashboardPeriod | undefined, now = new Date()): { $gte: Date; $lt?: Date } | undefined {
  if (period === '2026-08') return { $gte: new Date('2026-08-01T00:00:00.000Z'), $lt: new Date('2026-09-01T00:00:00.000Z') };
  if (period === '30d' || period === '90d') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - (period === '30d' ? 30 : 90));
    return { $gte: start };
  }
  return undefined;
}

function escapedSearch(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export async function resolveScopedUnitIds(
  filters: EquipmentFilterInput,
  scope: { role: 'unit_user' | 'ditel_admin'; unitId: string | null },
): Promise<string[] | null> {
  const organizational = await resolveOrganizationalScopeFromDatabase(
    { commandId: filters.commandId, unitId: filters.unitId },
    scope,
  );
  const canonicalIds = organizational.unitIds;
  const metadata = filters.municipality || filters.region;

  let metadataIds: string[] | null = null;
  if (metadata) {
    const unitFilter: Record<string, unknown> = { active: true };
    if (filters.municipality) unitFilter.municipality = filters.municipality;
    if (filters.region) unitFilter.region = filters.region;
    const units = await UnitModel.find(unitFilter).select({ id: 1, _id: 0 }).lean().exec();
    metadataIds = units.map((unit) => unit.id);
  }

  const candidates = [canonicalIds, metadataIds].filter((ids): ids is string[] => ids !== null);
  if (candidates.length === 0) return null;
  const intersection = candidates.reduce((result, ids) => result.filter((id) => ids.includes(id)));
  return [...new Set(intersection)];
}

export async function buildScopedEquipmentQuery(
  filters: EquipmentFilterInput,
  scope: { role: 'unit_user' | 'ditel_admin'; unitId: string | null },
  now = new Date(),
): Promise<ScopedEquipmentQuery> {
  const filter: FilterQuery<EquipmentDocument> = { 'custody.scope': { $ne: 'AC' } };
  const unitIds = await resolveScopedUnitIds(filters, scope);
  if (unitIds !== null) filter['unit.id'] = { $in: unitIds };
  if (filters.type) filter.type = filters.type;
  if (filters.model) filter.model = filters.model;
  if (filters.section) filter.section = filters.section;
  if (filters.situation === 'attention') filter.situation = { $in: ['lost', 'written_off'] };
  else if (filters.situation) filter.situation = filters.situation;
  if (filters.search) filter.$or = [{ patrimony: escapedSearch(filters.search) }, { type: escapedSearch(filters.search) }, { model: escapedSearch(filters.search) }, { brand: escapedSearch(filters.search) }];
  const createdAt = periodRange(filters.period, now);
  if (createdAt) filter.createdAt = createdAt;
  return { filter, unitIds };
}

export function unitReference(document: { id: string; name: string; acronym: string }): UnitReference {
  return { id: document.id, name: document.name, acronym: document.acronym };
}
