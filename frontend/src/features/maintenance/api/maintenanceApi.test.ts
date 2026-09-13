import { describe, expect, it, vi } from 'vitest'
import { getMaintenance, createMaintenance, updateMaintenance, type MaintenanceCreateRequest } from './maintenanceApi'

describe('maintenance API', () => {
  it('requests scoped maintenance records with credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await getMaintenance({ status: 'open', equipmentType: 'Rádio portátil' })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/maintenance?status=open&equipmentType=R%C3%A1dio+port%C3%A1til'), expect.objectContaining({ credentials: 'include' }))
    fetchMock.mockRestore()
  })

  it('creates maintenance with a closed public payload and no secrets', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'm-1' }), { status: 201 }))
    const input: MaintenanceCreateRequest = { equipmentId: '507f1f77bcf86cd799439011', description: 'Falha', status: 'open', type: 'corrective' }
    await createMaintenance(input)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/maintenance'), expect.objectContaining({ method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }))
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toMatch(/passwordHash|password|senha|token|tokenDigest|sessionId|storageKey/i)
    fetchMock.mockRestore()
  })

  it('updates only public maintenance fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'm-1' }), { status: 200 }))
    await updateMaintenance('m/1', { status: 'completed', updatedAt: '2026-09-10T12:00:00.000Z', service: 'Reparo' })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/maintenance/m%2F1'), expect.objectContaining({ method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed', updatedAt: '2026-09-10T12:00:00.000Z', service: 'Reparo' }) }))
    fetchMock.mockRestore()
  })
})
