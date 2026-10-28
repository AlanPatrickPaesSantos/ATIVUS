import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpClient } from '../../../shared/api/httpClient'
import { getOrganizationalIndicators, getOrganizationalNode, getOrganizationalStructure } from './organizationalStructureApi'

vi.mock('../../../shared/api/httpClient', () => ({
  httpClient: vi.fn(),
}))

describe('organizational structure API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('serializes pagination and filters as URL parameters', async () => {
    vi.mocked(httpClient).mockResolvedValueOnce({ items: [], total: 0, page: 2, pageSize: 50 })
    await getOrganizationalStructure({ page: 2, pageSize: 50, search: 'BPM.01', commandId: 'command-1', kind: 'bpm', verificationStatus: 'confirmed', active: true })
    expect(httpClient).toHaveBeenCalledWith('/admin/organizational-structure?page=2&pageSize=50&search=BPM.01&commandId=command-1&kind=bpm&verificationStatus=confirmed&active=true')
  })

  it('uses path-scoped requests for node and indicators without adding client credentials', async () => {
    vi.mocked(httpClient).mockResolvedValue({})
    await getOrganizationalNode('unit-1')
    await getOrganizationalIndicators('command-1')
    expect(httpClient).toHaveBeenNthCalledWith(1, '/admin/organizational-structure/unit-1')
    expect(httpClient).toHaveBeenNthCalledWith(2, '/admin/organizational-structure/command-1/indicators')
    expect(JSON.stringify(vi.mocked(httpClient).mock.calls)).not.toMatch(/authorization|token|password/i)
  })
})
