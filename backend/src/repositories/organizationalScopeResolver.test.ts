import { describe, expect, it } from 'vitest';

import {
  resolveOrganizationalScope,
  type OrganizationalScopeUnit,
} from './organizationalScopeResolver.js';

const units: OrganizationalScopeUnit[] = [
  { id: 'state', parentUnitId: null, kind: 'other', active: true },
  { id: 'command-north', parentUnitId: 'state', kind: 'intermediate_command', active: true },
  { id: 'region-north', parentUnitId: 'command-north', kind: 'other', active: true },
  { id: 'unit-a', parentUnitId: 'region-north', kind: 'bpm', active: true },
  { id: 'unit-b', parentUnitId: 'command-north', kind: 'cipm', active: true },
  { id: 'command-south', parentUnitId: 'state', kind: 'intermediate_command', active: true },
  { id: 'unit-c', parentUnitId: 'command-south', kind: 'specialized_unit', active: true },
];

describe('organizational scope resolver', () => {
  it('resolves all descendants across multiple hierarchy levels without text matching', () => {
    expect(resolveOrganizationalScope(units, { commandId: 'command-north' }, { role: 'ditel_admin', unitId: null })).toEqual({
      unitIds: ['command-north', 'region-north', 'unit-a', 'unit-b'],
      commandId: 'command-north',
      selectedUnitId: null,
    });
  });

  it('narrows a command scope to a related unit and rejects a unit from another command', () => {
    expect(resolveOrganizationalScope(units, { commandId: 'command-north', unitId: 'unit-a' }, { role: 'ditel_admin', unitId: null }).unitIds).toEqual(['unit-a']);
    expect(() => resolveOrganizationalScope(units, { commandId: 'command-north', unitId: 'unit-c' }, { role: 'ditel_admin', unitId: null })).toThrow('Unidade selecionada não pertence ao comando.');
  });

  it('forces unit users to their canonical unit regardless of submitted parameters', () => {
    expect(resolveOrganizationalScope(units, { commandId: 'command-south' }, { role: 'unit_user', unitId: 'unit-b' })).toEqual({
      unitIds: ['unit-b'],
      commandId: null,
      selectedUnitId: 'unit-b',
    });
  });

  it('keeps a command with no subordinates as a valid singleton scope', () => {
    const isolated = [...units, { id: 'command-empty', parentUnitId: null, kind: 'intermediate_command' as const, active: true }];
    expect(resolveOrganizationalScope(isolated, { commandId: 'command-empty' }, { role: 'ditel_admin', unitId: null }).unitIds).toEqual(['command-empty']);
  });

  it('fails closed for cycles and missing persisted parents', () => {
    expect(() => resolveOrganizationalScope([
      { id: 'cycle-a', parentUnitId: 'cycle-b', kind: 'other', active: true },
      { id: 'cycle-b', parentUnitId: 'cycle-a', kind: 'other', active: true },
    ], {}, { role: 'ditel_admin', unitId: null })).toThrow('Hierarquia organizacional inválida.');
    expect(() => resolveOrganizationalScope([
      { id: 'orphan', parentUnitId: 'missing', kind: 'bpm', active: true },
    ], {}, { role: 'ditel_admin', unitId: null })).toThrow('Hierarquia organizacional inválida.');
  });
});
