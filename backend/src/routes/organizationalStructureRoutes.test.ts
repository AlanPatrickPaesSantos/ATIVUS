import { describe, expect, it } from 'vitest';

import { AuthError } from '../auth/sessionService.js';
import { assertDitelAdmin } from './organizationalStructureRoutes.js';

describe('organizational structure routes', () => {
  it('returns 401 without an authenticated session', () => {
    expect(() => assertDitelAdmin(undefined)).toThrowError(AuthError);
    try { assertDitelAdmin(undefined); } catch (error) { expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' }); }
  });

  it('returns 403 for an authenticated unit user', () => {
    expect(() => assertDitelAdmin({ userId: 'u', name: 'U', registration: 'U', role: 'unit_user', unit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' } })).toThrowError(AuthError);
    try { assertDitelAdmin({ userId: 'u', name: 'U', registration: 'U', role: 'unit_user', unit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' } }); } catch (error) { expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' }); }
  });

  it('allows an authenticated DITEL administrator to reach the administrative route', () => {
    expect(() => assertDitelAdmin({ userId: 'u', name: 'U', registration: 'U', role: 'ditel_admin', unit: null })).not.toThrow();
  });
});
