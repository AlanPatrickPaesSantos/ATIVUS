import { describe, expect, it } from 'vitest';

import { buildOrganizationalIndicatorsPipeline, formatOrganizationalIndicators, resolveOrganizationalScope } from './organizationalIndicatorsRepository.js';

const command = { id: 'command-1', name: 'Comando 1', acronym: 'C1', parentUnitId: null };
const unit = { id: 'unit-1', name: 'Unidade 1', acronym: 'U1', parentUnitId: command.id };
const nested = { id: 'unit-2', name: 'Unidade 2', acronym: 'U2', parentUnitId: unit.id };

describe('organizational indicator aggregation', () => {
  it('resolves a command to all descendants and a unit to itself', () => {
    expect(resolveOrganizationalScope(command.id, [command, unit, nested])).toEqual({ root: command, unitIds: ['command-1', 'unit-1', 'unit-2'], children: [unit] });
    expect(resolveOrganizationalScope(unit.id, [command, unit, nested])).toEqual({ root: unit, unitIds: ['unit-1', 'unit-2'], children: [nested] });
  });

  it('fails closed for missing parents and cycles', () => {
    expect(() => resolveOrganizationalScope('missing', [command, unit])).toThrow('Organização não encontrada.');
    expect(() => resolveOrganizationalScope(command.id, [{ ...command, parentUnitId: 'missing' }, unit])).toThrow('hierarquia organizacional inválida');
    expect(() => resolveOrganizationalScope('cycle-a', [{ id: 'cycle-a', name: 'A', acronym: 'A', parentUnitId: 'cycle-b' }, { id: 'cycle-b', name: 'B', acronym: 'B', parentUnitId: 'cycle-a' }])).toThrow('hierarquia organizacional inválida');
  });

  it('builds a MongoDB pipeline scoped to unit IDs and excludes AC custody', () => {
    const pipeline = buildOrganizationalIndicatorsPipeline(['unit-1', 'unit-2']);
    expect(pipeline[0]).toEqual({ $match: { 'unit.id': { $in: ['unit-1', 'unit-2'] }, 'custody.scope': { $ne: 'AC' } } });
    expect(pipeline.some((stage) => '$facet' in stage)).toBe(true);
    expect(JSON.stringify(pipeline)).not.toContain('find');
  });

  it('formats situation, type and synthetic counts without duplicating totals', () => {
    expect(formatOrganizationalIndicators({
      root: command,
      unitIds: ['command-1', 'unit-1'],
      children: [unit],
    }, {
      totals: [{ total: 3, demonstrative: 2 }],
      bySituation: [{ _id: 'active', count: 2 }, { _id: 'maintenance', count: 1 }],
      byType: [{ _id: 'Rádio', count: 3 }],
      byUnit: [{ _id: 'unit-1', name: 'Unidade 1', count: 3 }],
    })).toEqual({
      units: 1,
      equipment: { total: 3, demonstrative: 2 },
      bySituation: { active: 2, maintenance: 1 },
      byType: { Rádio: 3 },
      children: [{ id: 'unit-1', name: 'Unidade 1', equipment: 3 }],
    });
  });
});
