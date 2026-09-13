import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { clearSession, createSession } from '../../../shared/auth/session'
import { fixtureSessionAdapter } from '../../auth/data/sessionFixture'
import { server } from '../../../shared/api/msw/server'
import { getInventory } from './inventoryApi'
import { inventoryQueryKey, inventoryQueryOptions } from './inventoryQueries'
import type { SessionContext } from '../../../shared/auth/types'

const northSession: SessionContext = {
  userId: 'unit-002',
  name: 'Bruno Santos',
  registration: '100002',
  role: 'unit_user',
  unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
}

async function authenticate(session: SessionContext) {
  await createSession({ signIn: async () => session }, 'any', 'any')
}

describe('inventory queries', () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' })
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')
  })

  afterEach(() => server.resetHandlers())
  afterAll(() => {
    clearSession()
    server.close()
  })

  it.each([
    ['search', { search: 'notebook' }],
    ['type', { type: 'Notebook' }],
    ['model', { model: 'ProBook' }],
    ['situation', { situation: 'active' }],
    ['page', { page: 2 }],
    ['pageSize', { pageSize: 20 }],
  ] as const)('changes the serializable query key when %s changes', (_variable, change) => {
    const baseQuery = { search: 'all', type: 'all', model: 'all', situation: 'all', page: 1, pageSize: 10 }
    expect(inventoryQueryKey(baseQuery)).not.toEqual(inventoryQueryKey({ ...baseQuery, ...change }))
  })

  it('isolates the query key by authenticated session', () => {
    expect(inventoryQueryKey({ page: 1, pageSize: 10 }))
      .not.toEqual(inventoryQueryKey({ page: 1, pageSize: 10 }, northSession))
  })

  it.each([
    ['search', { search: 'motorola' }, ['PAT-2026-004821']],
    ['type', { type: 'Impressora' }, ['PAT-2026-004828']],
    ['model', { model: 'Latitude 5420' }, ['PAT-2026-004827']],
    ['situation', { situation: 'maintenance' }, ['PAT-2026-004824']],
  ] as const)('filters by %s within the authenticated unit', async (_filter, filter, patrimonies) => {
    const response = await getInventory({ ...filter, page: 1, pageSize: 10 })

    expect(response.items.map((item) => item.patrimony)).toEqual(patrimonies)
    expect(response.items.every((item) => item.unitName === '3º BPM')).toBe(true)
  })

  it('paginates the authenticated unit fixture and returns the second page', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const response = await queryClient.fetchQuery(inventoryQueryOptions({
      page: 2,
      pageSize: 1,
    }))

    expect(response).toMatchObject({ total: 428, page: 2, pageSize: 1 })
    expect(response.items).toHaveLength(1)
    expect(response.items[0]).toMatchObject({ patrimony: 'PAT-2026-004822', unitName: '3º BPM' })
  })

  it('does not mix inventory results between authenticated units', async () => {
    const centroResponse = await getInventory({ page: 1, pageSize: 10 })
    await authenticate(northSession)
    const northResponse = await getInventory({ page: 1, pageSize: 10 })

    expect(centroResponse.items.map((item) => item.patrimony)).toEqual(['PAT-2026-004821', 'PAT-2026-004822', 'PAT-2026-004823', 'PAT-2026-004824', 'PAT-2026-004825', 'PAT-2026-004826', 'PAT-2026-004827', 'PAT-2026-004828', 'PAT-2026-004829'])
    expect(northResponse.items.map((item) => item.patrimony)).toEqual(['UN-001'])
    expect(northResponse.items).not.toEqual(expect.arrayContaining(centroResponse.items))
  })
})
