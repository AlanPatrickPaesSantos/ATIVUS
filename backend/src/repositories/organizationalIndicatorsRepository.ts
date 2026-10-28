import { EquipmentModel } from '../models/Equipment.js';
import { UnitModel, validateUnitHierarchy } from '../models/Unit.js';
import { AuthError } from '../auth/sessionService.js';
import type { PipelineStage } from 'mongoose';

export interface OrganizationalUnitRecord { id: string; name: string; acronym: string; parentUnitId: string | null }
export interface OrganizationalScope { root: OrganizationalUnitRecord; unitIds: string[]; children: OrganizationalUnitRecord[] }
export interface OrganizationalIndicatorFacet {
  totals: Array<{ total: number; demonstrative: number }>;
  bySituation: Array<{ _id: string; count: number }>;
  byType: Array<{ _id: string; count: number }>;
  byUnit: Array<{ _id: string; name: string; count: number }>;
}

export function resolveOrganizationalScope(rootId: string, units: OrganizationalUnitRecord[]): OrganizationalScope {
  const hierarchyErrors = validateUnitHierarchy(units);
  if (hierarchyErrors.length) throw new AuthError(409, 'INVALID_HIERARCHY', `A hierarquia organizacional inválida: ${hierarchyErrors.join(' ')}`);
  const root = units.find((unit) => unit.id === rootId);
  if (!root) throw new AuthError(404, 'NOT_FOUND', 'Organização não encontrada.');
  const descendants = units.filter((unit) => {
    let current = unit;
    while (current.parentUnitId) {
      if (current.parentUnitId === rootId) return true;
      const parent = units.find((candidate) => candidate.id === current.parentUnitId);
      if (!parent) return false;
      current = parent;
    }
    return false;
  });
  return { root, unitIds: [root.id, ...descendants.map((unit) => unit.id)], children: descendants.filter((unit) => unit.parentUnitId === rootId) };
}

export function buildOrganizationalIndicatorsPipeline(unitIds: string[]): PipelineStage[] {
  return [
    { $match: { 'unit.id': { $in: unitIds }, 'custody.scope': { $ne: 'AC' } } },
    { $facet: {
      totals: [{ $group: { _id: null, total: { $sum: 1 }, demonstrative: { $sum: { $cond: [{ $eq: ['$provenance.synthetic', true] }, 1, 0] } } } }],
      bySituation: [{ $group: { _id: '$situation', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      byUnit: [{ $group: { _id: '$unit.id', name: { $first: '$unit.name' }, count: { $sum: 1 } } }, { $sort: { name: 1, _id: 1 } }],
    } },
  ] as PipelineStage[];
}

export function formatOrganizationalIndicators(scope: OrganizationalScope, facet: OrganizationalIndicatorFacet) {
  const totals = facet.totals[0] ?? { total: 0, demonstrative: 0 };
  return {
    units: Math.max(scope.unitIds.length - 1, 0),
    equipment: { total: totals.total, demonstrative: totals.demonstrative },
    bySituation: Object.fromEntries(facet.bySituation.map((item) => [item._id, item.count])),
    byType: Object.fromEntries(facet.byType.map((item) => [item._id, item.count])),
    children: facet.byUnit.map((item) => ({ id: item._id, name: item.name, equipment: item.count })),
  };
}

export async function readOrganizationalIndicators(organizationId: string) {
  const units = await UnitModel.find({}).select({ _id: 0, id: 1, name: 1, acronym: 1, parentUnitId: 1 }).lean().exec() as OrganizationalUnitRecord[];
  const scope = resolveOrganizationalScope(organizationId, units);
  const [facet] = await EquipmentModel.aggregate<OrganizationalIndicatorFacet>(buildOrganizationalIndicatorsPipeline(scope.unitIds)).exec();
  return { scope: { id: scope.root.id, name: scope.root.name, acronym: scope.root.acronym }, indicators: formatOrganizationalIndicators(scope, facet ?? { totals: [], bySituation: [], byType: [], byUnit: [] }) };
}
