import { describe, expect, it } from 'vitest';

import { assertDitelAdmin } from './organizationalStructureRoutes.js';
import { buildOrganizationalUnitFilter } from '../repositories/organizationalStructureRepository.js';

describe('organizational structure scope security', () => {
  it('rejects a unit user even when an external unit and command are supplied as filters', () => {
    expect(() => assertDitelAdmin({ userId: 'unit-user', name: 'Unidade', registration: 'U1', role: 'unit_user', unit: { id: 'unit-own', name: 'Própria', acronym: 'PO' } })).toThrowError(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }));
    expect(buildOrganizationalUnitFilter({ unitId: 'unit-external', commandId: 'command-external' })).toEqual({ id: 'unit-external', parentUnitId: 'command-external' });
  });

  it('requires a DITEL session before a statewide request can be considered', () => {
    expect(() => assertDitelAdmin(undefined)).toThrowError(expect.objectContaining({ statusCode: 401, code: 'UNAUTHENTICATED' }));
  });
});
