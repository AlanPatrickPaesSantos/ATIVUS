import { describe, expect, it } from 'vitest'

import { reportScopeFromQuery } from '../../reports/pages/ReportsPage'

describe('organizational structure report navigation', () => {
  it('preselects a unit only for an authorized DITEL report context', () => {
    expect(reportScopeFromQuery(new URLSearchParams('unitId=unit-1'), true)).toBe('unit-1')
    expect(reportScopeFromQuery(new URLSearchParams('unitId=unit-1'), false)).toBe('statewide')
    expect(reportScopeFromQuery(new URLSearchParams(), true)).toBe('statewide')
  })
})
