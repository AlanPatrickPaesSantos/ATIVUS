import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PendingOperationsPage } from './PendingOperationsPage'

const { getPendingOperationsMock } = vi.hoisted(() => ({ getPendingOperationsMock: vi.fn() }))
vi.mock('../api/pendingApi', () => ({ getPendingOperations: getPendingOperationsMock }))

describe('PendingOperationsPage', () => {
  it('renders counters, operation links and empty states from the read-only API', async () => {
    getPendingOperationsMock.mockResolvedValue({ items: [{ id: '1', source: 'movement', type: 'Transferência', state: 'Pendente', description: 'U1 → U2', action: 'Autorizar transferência', priority: null, date: '2026-10-01T00:00:00.000Z', unitId: 'u1', reference: { path: '/movimentacoes?movementId=1', label: 'Movimentações' } }], total: 1, page: 1, pageSize: 20, totalPages: 1, counts: [{ source: 'movement', total: 1 }] })
    render(<MemoryRouter><PendingOperationsPage session={{ userId: 'u', name: 'Usuário', registration: '1', role: 'unit_user', unit: { id: 'u1', name: 'Unidade 1', acronym: 'U1' }, mustChangePassword: false }} /></MemoryRouter>)
    expect(await screen.findByText('U1 → U2')).toBeTruthy()
    expect(screen.getAllByText('Transferência').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /Abrir Movimentações/ }).getAttribute('href')).toBe('/movimentacoes?movementId=1')
    await waitFor(() => expect(screen.queryByText('Carregando pendências')).toBeNull())
  })
})
