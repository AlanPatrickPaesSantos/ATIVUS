import { describe, expect, it, vi } from 'vitest'
import { createAcReturn, decideAcReturn, getAcReturns, decideMovement, getMovements } from './movementsApi'

describe('movementsApi', () => {
  it('requests the backend movement list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await getMovements()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements', expect.objectContaining({ credentials: 'include' }))
    fetchMock.mockRestore()
  })
})

it('serializes movement filters and pagination for the backend', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 2, pageSize: 10, totalPages: 0 }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)

  await getMovements({ page: 2, pageSize: 10, status: 'Pendente', unitId: 'unit-2', search: 'PAT-1', from: '2026-10-01', to: '2026-10-31' })

  expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements?page=2&pageSize=10&status=Pendente&unitId=unit-2&search=PAT-1&from=2026-10-01&to=2026-10-31', expect.objectContaining({ credentials: 'include' }))
})

it('sends a triage decision with the server version and rejection reason', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'mov-1' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)

  await decideMovement('mov-1', { status: 'Rejeitada', updatedAt: '2026-08-30T10:00:00.000Z', reason: 'Documento pendente.' })

  expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements/mov-1/decision', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ status: 'Rejeitada', updatedAt: '2026-08-30T10:00:00.000Z', reason: 'Documento pendente.' }),
  }))
})

it('sends an idempotent AC return request', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'return-1' }), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)

  await createAcReturn({ equipmentId: 'equipment-1', reason: 'Conferência.' }, 'return-key')

  expect(fetchMock).toHaveBeenCalledWith('/api/v1/ac/returns', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ 'Idempotency-Key': 'return-key' }),
    body: JSON.stringify({ equipmentId: 'equipment-1', reason: 'Conferência.' }),
  }))
})

it('loads and decides AC returns with the server version', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'return-1', status: 'Aceita' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)

  await getAcReturns()
  await decideAcReturn('return-1', { status: 'Aceita', updatedAt: '2026-10-28T10:00:00.000Z' })

  expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/ac/returns', expect.objectContaining({ credentials: 'include' }))
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/ac/returns/return-1/decision', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Aceita', updatedAt: '2026-10-28T10:00:00.000Z' }) }))
})
