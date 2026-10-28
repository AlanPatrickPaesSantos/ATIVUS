import { describe, expect, it } from 'vitest'
import { missingRealBackendEnvironment } from '../../../e2e-real/realBackendEnvironment'

describe('real backend environment', () => {
  it('requires two independent unit credentials and stable unit ids', () => {
    const missing = missingRealBackendEnvironment({
      E2E_REAL_DITEL_REGISTRATION: 'ditel',
      E2E_REAL_DITEL_PASSWORD: 'redacted',
      E2E_REAL_UNIT_A_REGISTRATION: 'unit-a',
      E2E_REAL_UNIT_A_PASSWORD: 'redacted',
      E2E_REAL_UNIT_A_ID: 'pmpa:unit:a',
      E2E_REAL_UNIT_B_REGISTRATION: 'unit-b',
      E2E_REAL_UNIT_B_PASSWORD: 'redacted',
    }, [
      'E2E_REAL_UNIT_A_REGISTRATION',
      'E2E_REAL_UNIT_A_PASSWORD',
      'E2E_REAL_UNIT_A_ID',
      'E2E_REAL_UNIT_B_REGISTRATION',
      'E2E_REAL_UNIT_B_PASSWORD',
      'E2E_REAL_UNIT_B_ID',
    ])

    expect(missing).toEqual(['E2E_REAL_UNIT_B_ID'])
  })
})
