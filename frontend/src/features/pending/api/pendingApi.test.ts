import { describe, expect, it, vi } from 'vitest'
import { getPendingOperations } from './pendingApi'

describe('pending operations api', () => {
  it('serializes filters and pagination', async () => {
    const response = { items: [], total: 0, page: 2, pageSize: 10, totalPages: 0, counts: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await getPendingOperations({ page: 2, pageSize: 10, source: 'call', search: 'rádio' })
    expect(fetch).toHaveBeenCalledWith('/api/v1/pending-operations?page=2&pageSize=10&source=call&search=r%C3%A1dio', expect.objectContaining({ credentials: 'include' }))
    vi.unstubAllGlobals()
  })
})
