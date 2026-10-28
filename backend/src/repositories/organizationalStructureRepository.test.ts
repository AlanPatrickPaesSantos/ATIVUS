import { describe, expect, it } from 'vitest';

import { buildOrganizationalUnitFilter, parseOrganizationalStructureQuery, summarizeEquipmentCountsForOrganizations } from './organizationalStructureRepository.js';

describe('organizational structure query parsing', () => {
  it('applies bounded pagination and preserves all supported filters', () => {
    expect(parseOrganizationalStructureQuery({
      page: '2',
      pageSize: '50',
      search: 'BPM.01',
      commandId: 'command-1',
      unitId: 'unit-1',
      kind: 'bpm',
      verificationStatus: 'confirmed',
      active: 'true',
    })).toEqual({
      page: 2,
      pageSize: 50,
      filters: {
        search: 'BPM.01',
        commandId: 'command-1',
        unitId: 'unit-1',
        kind: 'bpm',
        verificationStatus: 'confirmed',
        active: true,
      },
    });
  });

  it('rejects invalid pagination, kind, verification status and boolean filters', () => {
    expect(() => parseOrganizationalStructureQuery({ page: '0' })).toThrow('Parâmetros de paginação inválidos.');
    expect(() => parseOrganizationalStructureQuery({ pageSize: '101' })).toThrow('Parâmetros de paginação inválidos.');
    expect(() => parseOrganizationalStructureQuery({ kind: 'unknown' })).toThrow('Tipo organizacional inválido.');
    expect(() => parseOrganizationalStructureQuery({ verificationStatus: 'unknown' })).toThrow('Status de verificação inválido.');
    expect(() => parseOrganizationalStructureQuery({ active: 'maybe' })).toThrow('Filtro active inválido.');
  });

  it('builds literal search and organizational filters without broadening the query', () => {
    const filter = buildOrganizationalUnitFilter({ search: 'BPM.01', commandId: 'command-1', kind: 'bpm', verificationStatus: 'confirmed', active: true });
    expect(filter).toMatchObject({ parentUnitId: 'command-1', kind: 'bpm', verificationStatus: 'confirmed', active: true });
    expect(filter.$or).toHaveLength(3);
    expect(String((filter.$or as Array<{ name?: RegExp }>)[1].name)).toBe('/BPM\\.01/i');
  });

  it('sums equipment counts for an organization and its descendants', () => {
    expect(summarizeEquipmentCountsForOrganizations([
      { id: 'command-1', parentUnitId: null },
      { id: 'unit-1', parentUnitId: 'command-1' },
      { id: 'unit-2', parentUnitId: 'unit-1' },
    ], [
      { unitId: 'unit-1', total: 4, demonstrative: 3 },
      { unitId: 'unit-2', total: 2, demonstrative: 2 },
    ])).toEqual({
      'command-1': { total: 6, demonstrative: 5 },
      'unit-1': { total: 6, demonstrative: 5 },
      'unit-2': { total: 2, demonstrative: 2 },
    });
  });
});
