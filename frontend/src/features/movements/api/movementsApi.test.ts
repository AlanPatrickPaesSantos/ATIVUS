import { describe, expect, it, vi } from 'vitest'
import { decideMovement, getMovements } from './movementsApi'

describe('movementsApi', () => {
  it('requests the backend movement list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await getMovements()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements', expect.objectContaining({ credentials: 'include' }))
    fetchMock.mockRestore()
  })
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
