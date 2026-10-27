import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/errors'
import { createAcMaterial, createAcTransfer, getAcMaterials, getAcTransfer, getAcTransfers } from './acApi'

describe('AC API', () => {
  it('requests paginated AC materials with the real query contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 2, pageSize: 10 }), { status: 200 }))

    await getAcMaterials({ search: 'radio', page: 2, pageSize: 10 })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/ac/materials?page=2&pageSize=10&search=radio', expect.objectContaining({ credentials: 'include' }))
    fetchMock.mockRestore()
  })

  it('sends only patrimonial fields when creating an AC material', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'equipment-1' }), { status: 201 }))

    await createAcMaterial({ patrimony: 'RP-001', type: 'Rádio', model: 'APX', brand: 'Motorola', situation: 'active', location: 'AC', category: 'Comunicação' })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/ac/materials', expect.objectContaining({ method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: expect.not.stringContaining('custody') }))
    fetchMock.mockRestore()
  })

  it('sends the caller-provided idempotency key for transfer confirmation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'transfer-1' }), { status: 201 }))

    await createAcTransfer({ destinationUnit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' }, distributedAt: '2026-10-26T12:00:00.000Z', deliverer: { name: 'Entregador' }, receiver: { name: 'Recebedor' }, equipmentIds: ['equipment-1'] }, 'attempt-key-1')

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/ac/transfers', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'attempt-key-1' } }))
    fetchMock.mockRestore()
  })

  it('keeps API errors including conflicts and supports transfer queries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'IDEMPOTENCY_CONFLICT', message: 'Conflito' }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'transfer-1' }), { status: 200 }))

    await expect(createAcTransfer({ destinationUnit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' }, distributedAt: '2026-10-26T12:00:00.000Z', deliverer: { name: 'Entregador' }, receiver: { name: 'Recebedor' }, equipmentIds: ['equipment-1'] }, 'attempt-key-1')).rejects.toBeInstanceOf(ApiError)
    await expect(getAcTransfers({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0 })
    await expect(getAcTransfer('transfer-1')).resolves.toMatchObject({ id: 'transfer-1' })
    fetchMock.mockRestore()
  })

  it('keeps the same caller-provided idempotency key when the response is uncertain', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(createAcTransfer({ destinationUnit: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' }, distributedAt: '2026-10-26T12:00:00.000Z', deliverer: { name: 'Entregador' }, receiver: { name: 'Recebedor' }, equipmentIds: ['equipment-1'] }, 'same-attempt-key')).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/ac/transfers', expect.objectContaining({ headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'same-attempt-key' } }))
    fetchMock.mockRestore()
  })
})
