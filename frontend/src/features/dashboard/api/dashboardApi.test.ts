import '@testing-library/jest-dom/vitest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureSessionAdapter } from '../../auth/data/sessionFixture'
import { createSession, clearSession } from '../../../shared/auth/session'
import { server } from '../../../shared/api/msw/server'
import { getDashboard, getUnitDashboard } from './dashboardApi'

describe('getUnitDashboard with the MSW API boundary', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => clearSession())
  afterAll(() => {
    clearSession()
    server.close()
  })

  it('returns the complete dashboard contract scoped to the authenticated Unit', async () => {
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')

    await expect(getUnitDashboard()).resolves.toEqual({
      unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' },
      metrics: { total: 428, active: 7, maintenance: 1, attention: 1 },
      situations: [
        { situation: 'active', label: 'Em operação', count: 7 },
        { situation: 'maintenance', label: 'Em manutenção', count: 1 },
        { situation: 'attention', label: 'Requer atenção', count: 1 },
      ],
      recentActivity: [
        { id: 'activity-unit-centro-1', description: 'Inventário do 3º BPM atualizado.', occurredAt: 'Hoje, 09:30' },
      ],
      unitSummaries: [
        { unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, coverage: '100%', equipment: 428, attention: 1 },
      ],
      callsByStatus: [
        { status: 'Aberto', label: 'Aberto', count: 1 },
      ],
      criticalCalls: 3,
      pendingMovements: 0,
      monitoredUnits: 1,
      recentMovements: [],
    })
  })

  it('changes the response scope when the authenticated Unit changes', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-unit')
    // The fixture user is intentionally replaced with the North Unit session below;
    // this test keeps the assertion at the API boundary, where page unit ids cannot enter.
    await createSession({ signIn: async () => ({
      userId: 'unit-norte-user', name: 'Norte', registration: '100002', role: 'unit_user',
      unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
    }) }, '100002', 'sigat-unit')

    const dashboard = await getUnitDashboard()

    expect(dashboard.unit).toEqual({ id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' })
    expect(dashboard.metrics).toEqual({ total: 1, active: 1, maintenance: 0, attention: 0 })
    expect(dashboard.recentActivity).toEqual([
      { id: 'activity-unit-norte-1', description: 'Inventário da Unidade Norte atualizado.', occurredAt: 'Hoje, 10:15' },
    ])
  })

  it('allows a DITEL administrator without a unit to load the statewide dashboard', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

    await expect(getDashboard()).resolves.toMatchObject({
      unit: { id: 'statewide', name: 'Estado do Pará', acronym: 'DITEL' },
      metrics: expect.objectContaining({ total: expect.any(Number), active: expect.any(Number), maintenance: expect.any(Number), attention: expect.any(Number) }),
      situations: expect.arrayContaining([
        expect.objectContaining({ situation: 'active', label: 'Em operação' }),
        expect.objectContaining({ situation: 'maintenance', label: 'Em manutenção' }),
        expect.objectContaining({ situation: 'attention', label: 'Requer atenção' }),
      ]),
      unitSummaries: expect.arrayContaining([
        expect.objectContaining({ unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, equipment: expect.any(Number), attention: expect.any(Number) }),
      ]),
    })
  })
})
