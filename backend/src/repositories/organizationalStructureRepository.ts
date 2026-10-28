import { AuthError } from '../auth/sessionService.js';
import { EquipmentModel } from '../models/Equipment.js';
import { UnitModel, type OrganizationalUnitKind, type OrganizationalVerificationStatus } from '../models/Unit.js';
import { descendantUnitIds, resolveOrganizationalScope, type OrganizationalScopeUnit } from './organizationalScopeResolver.js';

const kinds = new Set<OrganizationalUnitKind>(['intermediate_command', 'bpm', 'cipm', 'specialized_unit', 'cime', 'cipamb', 'organic_company', 'pel_dest', 'ppd', 'other']);
const verificationStatuses = new Set<OrganizationalVerificationStatus>(['confirmed', 'divergent', 'pending']);

export interface OrganizationalStructureFilters {
  search?: string;
  commandId?: string;
  unitId?: string;
  kind?: OrganizationalUnitKind;
  verificationStatus?: OrganizationalVerificationStatus;
  active?: boolean;
}

export interface OrganizationalStructurePagination { page: number; pageSize: number }

export interface OrganizationalStructureItem {
  id: string;
  name: string;
  acronym: string;
  kind: OrganizationalUnitKind;
  parentUnitId: string | null;
  parent: { id: string; name: string; acronym: string } | null;
  independent: boolean;
  active: boolean;
  verificationStatus: OrganizationalVerificationStatus;
  childrenCount: number;
  equipmentCount: number;
  demonstrativeEquipmentCount: number;
}
type EquipmentCount = { total: number; demonstrative: number };

export interface OrganizationalFilterOption {
  id: string;
  name: string;
  acronym: string;
  kind: OrganizationalUnitKind;
  parentUnitId: string | null;
  equipmentCount: number;
}

export interface OrganizationalFilterOptions {
  commands: Array<{ id: string; name: string; acronym: string; equipmentCount: number; units: OrganizationalFilterOption[] }>;
  units: OrganizationalFilterOption[];
}

export function buildOrganizationalFilterOptions(
  units: Array<Pick<OrganizationalScopeUnit, 'id' | 'parentUnitId' | 'kind'> & { name: string; acronym: string }>,
  counts: Array<{ unitId: string; total: number }>,
): OrganizationalFilterOptions {
  const organizationalUnits = units.map((unit) => ({ ...unit, active: true }));
  const directCounts = new Map(counts.map((count) => [count.unitId, count.total]));
  const propagated = summarizeEquipmentCountsForOrganizations(organizationalUnits, counts.map((count) => ({ ...count, demonstrative: 0 })));
  const toOption = (unit: typeof units[number]): OrganizationalFilterOption => ({
    id: unit.id,
    name: unit.name,
    acronym: unit.acronym,
    kind: unit.kind,
    parentUnitId: unit.parentUnitId,
    equipmentCount: propagated[unit.id]?.total ?? directCounts.get(unit.id) ?? 0,
  });
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const commands = units.filter((unit) => unit.kind === 'intermediate_command').map((command) => ({
    id: command.id,
    name: command.name,
    acronym: command.acronym,
    equipmentCount: propagated[command.id]?.total ?? 0,
    units: descendantUnitIds(organizationalUnits, command.id).filter((id) => id !== command.id).map((id) => toOption(byId.get(id)!)),
  }));
  const subordinateUnits = units.filter((unit) => unit.kind !== 'intermediate_command').map(toOption);
  return { commands, units: subordinateUnits };
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseOrganizationalStructureQuery(query: Record<string, unknown>): { filters: OrganizationalStructureFilters; page: number; pageSize: number } {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new AuthError(400, 'INVALID_QUERY', 'Parâmetros de paginação inválidos.');
  const kind = text(query.kind);
  if (kind && !kinds.has(kind as OrganizationalUnitKind)) throw new AuthError(400, 'INVALID_QUERY', 'Tipo organizacional inválido.');
  const verificationStatus = text(query.verificationStatus);
  if (verificationStatus && !verificationStatuses.has(verificationStatus as OrganizationalVerificationStatus)) throw new AuthError(400, 'INVALID_QUERY', 'Status de verificação inválido.');
  const activeRaw = text(query.active);
  if (activeRaw && activeRaw !== 'true' && activeRaw !== 'false') throw new AuthError(400, 'INVALID_QUERY', 'Filtro active inválido.');
  return {
    page,
    pageSize,
    filters: {
      search: text(query.search),
      commandId: text(query.commandId),
      unitId: text(query.unitId),
      kind: kind as OrganizationalUnitKind | undefined,
      verificationStatus: verificationStatus as OrganizationalVerificationStatus | undefined,
      ...(activeRaw ? { active: activeRaw === 'true' } : {}),
    },
  };
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function buildOrganizationalUnitFilter(filters: OrganizationalStructureFilters): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (filters.search) {
    const search = new RegExp(escapeRegex(filters.search), 'i');
    result.$or = [{ id: search }, { name: search }, { acronym: search }];
  }
  if (filters.commandId) result.parentUnitId = filters.commandId;
  if (filters.unitId) result.id = filters.unitId;
  if (filters.kind) result.kind = filters.kind;
  if (filters.verificationStatus) result.verificationStatus = filters.verificationStatus;
  if (filters.active !== undefined) result.active = filters.active;
  return result;
}

export function summarizeEquipmentCountsForOrganizations(organizations: Array<{ id: string; parentUnitId: string | null }>, counts: Array<{ unitId: string; total: number; demonstrative: number }>): Record<string, EquipmentCount> {
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));
  const result: Record<string, EquipmentCount> = Object.fromEntries(organizations.map((organization) => [organization.id, { total: 0, demonstrative: 0 }]));
  for (const count of counts) {
    let current = byId.get(count.unitId);
    while (current) {
      result[current.id].total += count.total;
      result[current.id].demonstrative += count.demonstrative;
      current = current.parentUnitId ? byId.get(current.parentUnitId) : undefined;
    }
  }
  return result;
}

function toItem(unit: Record<string, any>, parent: Record<string, any> | null, childrenCount: number, equipment: EquipmentCount): OrganizationalStructureItem {
  return {
    id: unit.id,
    name: unit.name,
    acronym: unit.acronym,
    kind: unit.kind ?? 'other',
    parentUnitId: unit.parentUnitId ?? null,
    parent: parent ? { id: parent.id, name: parent.name, acronym: parent.acronym } : null,
    independent: unit.independent ?? false,
    active: unit.active,
    verificationStatus: unit.verificationStatus ?? 'pending',
    childrenCount,
    equipmentCount: equipment.total,
    demonstrativeEquipmentCount: equipment.demonstrative,
  };
}

async function buildItems(units: Array<Record<string, any>>): Promise<OrganizationalStructureItem[]> {
  const parentIds = [...new Set(units.map((unit) => unit.parentUnitId).filter(Boolean))];
  const parents = parentIds.length ? await UnitModel.find({ id: { $in: parentIds } }).select({ id: 1, name: 1, acronym: 1 }).lean().exec() : [];
  const parentById = new Map(parents.map((parent) => [parent.id, parent]));
  const childCounts = await UnitModel.aggregate<{ _id: string; count: number }>([
    { $match: { parentUnitId: { $in: units.map((unit) => unit.id) } } },
    { $group: { _id: '$parentUnitId', count: { $sum: 1 } } },
  ]).exec();
  const countByParent = new Map(childCounts.map((item) => [item._id, item.count]));
  const allUnits = await UnitModel.find({}).select({ _id: 0, id: 1, parentUnitId: 1 }).lean().exec() as Array<{ id: string; parentUnitId: string | null }>;
  const equipmentCounts = await EquipmentModel.aggregate<{ _id: string; total: number; demonstrative: number }>([
    { $match: { 'custody.scope': { $ne: 'AC' } } },
    { $group: { _id: '$unit.id', total: { $sum: 1 }, demonstrative: { $sum: { $cond: [{ $eq: ['$provenance.synthetic', true] }, 1, 0] } } } },
  ]).exec();
  const equipmentByOrganization = summarizeEquipmentCountsForOrganizations(allUnits, equipmentCounts.filter((item) => item._id).map((item) => ({ unitId: item._id, total: item.total, demonstrative: item.demonstrative })));
  return units.map((unit) => toItem(unit, parentById.get(unit.parentUnitId) ?? null, countByParent.get(unit.id) ?? 0, equipmentByOrganization[unit.id] ?? { total: 0, demonstrative: 0 }));
}

export async function listOrganizationalUnits(filters: OrganizationalStructureFilters, pagination: OrganizationalStructurePagination) {
  const filter = buildOrganizationalUnitFilter(filters);
  const [total, units] = await Promise.all([
    UnitModel.countDocuments(filter).exec(),
    UnitModel.find(filter).select({ _id: 0, id: 1, name: 1, acronym: 1, kind: 1, parentUnitId: 1, independent: 1, active: 1, verificationStatus: 1 }).sort({ name: 1, id: 1 }).skip((pagination.page - 1) * pagination.pageSize).limit(pagination.pageSize).lean().exec(),
  ]);
  return { items: await buildItems(units as Array<Record<string, any>>), total, page: pagination.page, pageSize: pagination.pageSize };
}

export async function getOrganizationalNode(id: string) {
  const unit = await UnitModel.findOne({ id }).select({ _id: 0, id: 1, name: 1, acronym: 1, kind: 1, parentUnitId: 1, independent: 1, active: 1, verificationStatus: 1 }).lean().exec();
  if (!unit) return null;
  const children = await UnitModel.find({ parentUnitId: id }).select({ _id: 0, id: 1, name: 1, acronym: 1, kind: 1, parentUnitId: 1, independent: 1, active: 1, verificationStatus: 1 }).sort({ name: 1, id: 1 }).lean().exec();
  const [organization] = await buildItems([unit as Record<string, any>]);
  return { organization, children: await buildItems(children as Array<Record<string, any>>) };
}

export async function getOrganizationalFilterOptions(actor: { role: 'unit_user' | 'ditel_admin'; unitId: string | null }): Promise<OrganizationalFilterOptions> {
  const filter = actor.role === 'unit_user' ? { id: actor.unitId, active: true } : { active: true };
  const units = await UnitModel.find(filter)
    .select({ _id: 0, id: 1, name: 1, acronym: 1, kind: 1, parentUnitId: 1, active: 1 })
    .sort({ name: 1, id: 1 })
    .lean()
    .exec();
  const normalizedUnits = units.map((unit) => ({ ...unit, kind: (unit.kind ?? 'other') as OrganizationalUnitKind, parentUnitId: unit.parentUnitId ?? null }));
  if (actor.role === 'ditel_admin') resolveOrganizationalScope(normalizedUnits, {}, actor);
  const grouped = await EquipmentModel.aggregate<{ _id: string; total: number }>([
    { $match: { 'custody.scope': { $ne: 'AC' }, 'unit.id': { $in: normalizedUnits.map((unit) => unit.id) } } },
    { $group: { _id: '$unit.id', total: { $sum: 1 } } },
  ]).exec();
  return buildOrganizationalFilterOptions(normalizedUnits, grouped.filter((item) => item._id).map((item) => ({ unitId: item._id, total: item.total })));
}
