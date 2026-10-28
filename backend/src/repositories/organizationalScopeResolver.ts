import { UnitModel, type OrganizationalUnitKind } from '../models/Unit.js';
import { AuthError } from '../auth/sessionService.js';

export interface OrganizationalScopeUnit {
  id: string;
  parentUnitId: string | null;
  kind: OrganizationalUnitKind;
  active: boolean;
}

export interface OrganizationalScopeFilters {
  commandId?: string;
  unitId?: string;
}

export interface OrganizationalScopeActor {
  role: 'unit_user' | 'ditel_admin';
  unitId: string | null;
}

export interface ResolvedOrganizationalScope {
  unitIds: string[] | null;
  commandId: string | null;
  selectedUnitId: string | null;
}

function invalidHierarchy(): Error {
  return new AuthError(400, 'INVALID_QUERY', 'Hierarquia organizacional inválida.');
}

function validateHierarchy(units: OrganizationalScopeUnit[]): Map<string, OrganizationalScopeUnit> {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    const visited = new Set<string>();
    let current: OrganizationalScopeUnit | undefined = unit;
    while (current?.parentUnitId) {
      if (visited.has(current.id) || current.parentUnitId === unit.id) throw invalidHierarchy();
      visited.add(current.id);
      current = byId.get(current.parentUnitId);
      if (!current) throw invalidHierarchy();
    }
  }
  return byId;
}

export function descendantUnitIds(units: OrganizationalScopeUnit[], rootId: string): string[] {
  const descendants = [rootId];
  const included = new Set(descendants);
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of units) {
      if (unit.parentUnitId && included.has(unit.parentUnitId) && !included.has(unit.id)) {
        included.add(unit.id);
        descendants.push(unit.id);
        changed = true;
      }
    }
  }
  return descendants;
}

export function resolveOrganizationalScope(
  units: OrganizationalScopeUnit[],
  filters: OrganizationalScopeFilters,
  actor: OrganizationalScopeActor,
): ResolvedOrganizationalScope {
  if (actor.role === 'unit_user') {
    if (!actor.unitId) throw new AuthError(403, 'FORBIDDEN', 'Escopo de unidade obrigatório.');
    if (filters.unitId && filters.unitId !== actor.unitId) return { unitIds: [], commandId: null, selectedUnitId: null };
    return { unitIds: [actor.unitId], commandId: null, selectedUnitId: actor.unitId };
  }

  const byId = validateHierarchy(units);
  const command = filters.commandId ? byId.get(filters.commandId) : undefined;
  if (filters.commandId && (!command || command.kind !== 'intermediate_command' || !command.active)) {
    throw new AuthError(400, 'INVALID_QUERY', 'Comando intermediário inválido.');
  }

  if (filters.unitId) {
    const unit = byId.get(filters.unitId);
    if (!unit || !unit.active) throw new AuthError(400, 'INVALID_QUERY', 'Unidade selecionada inválida.');
    if (filters.commandId && !descendantUnitIds(units, filters.commandId).includes(filters.unitId)) {
      throw new AuthError(400, 'INVALID_QUERY', 'Unidade selecionada não pertence ao comando.');
    }
    return { unitIds: [filters.unitId], commandId: filters.commandId ?? null, selectedUnitId: filters.unitId };
  }

  return {
    unitIds: filters.commandId ? descendantUnitIds(units, filters.commandId) : null,
    commandId: filters.commandId ?? null,
    selectedUnitId: null,
  };
}

export async function resolveOrganizationalScopeFromDatabase(
  filters: OrganizationalScopeFilters,
  actor: OrganizationalScopeActor,
): Promise<ResolvedOrganizationalScope> {
  if (actor.role === 'unit_user') return resolveOrganizationalScope([], filters, actor);
  const units = await UnitModel.find({ active: true })
    .select({ _id: 0, id: 1, parentUnitId: 1, kind: 1, active: 1 })
    .lean()
    .exec() as OrganizationalScopeUnit[];
  return resolveOrganizationalScope(units, filters, actor);
}
