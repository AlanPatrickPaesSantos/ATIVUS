import { describe, expect, it } from 'vitest'

import {
  assertRealBackendEnvironment,
  missingRealBackendEnvironment,
  shouldSkipRealBackendSmoke,
} from './e2e-real/realBackendEnvironment'

describe('real backend E2E environment guard', () => {
  it('keeps manual runs safe by skipping when required credentials are absent by default', () => {
    const env = {}

    expect(missingRealBackendEnvironment(env)).toEqual([
      'E2E_REAL_DITEL_REGISTRATION',
      'E2E_REAL_DITEL_PASSWORD',
      'E2E_REAL_UNIT_REGISTRATION',
      'E2E_REAL_UNIT_PASSWORD',
    ])
    expect(shouldSkipRealBackendSmoke(env)).toBe(true)
    expect(() => assertRealBackendEnvironment(env)).not.toThrow()
  })

  it('fails clearly when strict real-backend env mode is enabled without all required values', () => {
    const env = {
      E2E_REAL_REQUIRE_ENV: 'true',
      E2E_REAL_DITEL_REGISTRATION: 'hml-admin',
    }

    expect(shouldSkipRealBackendSmoke(env)).toBe(false)
    expect(() => assertRealBackendEnvironment(env)).toThrow(
      'Missing required real-backend E2E env: E2E_REAL_DITEL_PASSWORD, E2E_REAL_UNIT_REGISTRATION, E2E_REAL_UNIT_PASSWORD',
    )
  })
})
