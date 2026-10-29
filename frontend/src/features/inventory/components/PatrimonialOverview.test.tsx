import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PatrimonialReadView } from '../../../shared/api/contracts'
import { PatrimonialOverview } from './PatrimonialOverview'

const view: PatrimonialReadView = {
  equipment: {
    id: 'eq-001', patrimony: 'PAT-2026-004821', serialNumber: 'SER-001', type: 'Rádio portátil', brand: 'Motorola', model: 'APX 2000', category: 'Comunicação', situation: 'active', location: 'Sala de Comunicações', unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, custody: { scope: 'UNIT', unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' } }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  },
  activeOperation: { id: 'mov-1', kind: 'unit_transfer', equipmentId: 'eq-001', status: 'Aguardando recebimento', requestedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', origin: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, destination: { scope: 'UNIT', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' } }, reason: null, divergenceCount: 0 },
  history: { items: [{ id: 'history-1', source: 'movement', description: 'Transferência aprovada', occurredAt: '2026-01-02T00:00:00.000Z', status: 'Aguardando recebimento', operationId: 'mov-1', snapshot: null }], total: 1, page: 1, pageSize: 1 },
  relatedCalls: [{ id: 'call-1', protocol: 'CH-001', subject: 'Falha no áudio', status: 'Aberto', openedAt: '2026-01-02T00:00:00.000Z' }],
  documents: [{ id: 'doc-1', name: 'Termo.pdf', type: 'application/pdf', size: 10, uploadedAt: '2026-01-02T00:00:00.000Z', status: 'active', downloadUrl: '/download/doc-1', source: 'equipment' }],
  auditEvents: { items: [{ id: 'audit-1', action: 'movements.decision', module: 'movements', userId: 'ditel-1', actor: null, entity: null, unit: null, result: 'success', reason: null, before: null, after: null, retentionExpiresAt: null, createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }], total: 1, page: 1, pageSize: 10 },
}

vi.mock('../api/inventoryApi', () => ({ getPatrimonialView: vi.fn() }))
import { getPatrimonialView } from '../api/inventoryApi'

afterEach(() => vi.clearAllMocks())

describe('PatrimonialOverview', () => {
  it('shows custody, pending operation, history, calls and documents without exposing audit to a unit user', async () => {
    vi.mocked(getPatrimonialView).mockResolvedValue(view)

    render(<MemoryRouter><PatrimonialOverview equipmentId="eq-001" canViewAudit={false} /></MemoryRouter>)

    expect(screen.getByRole('status')).toHaveTextContent('Carregando situação patrimonial')
    expect(await screen.findByText('Custódia atual confirmada')).toBeInTheDocument()
    expect(screen.getAllByText('3º BPM').length).toBeGreaterThan(0)
    expect(screen.getByText('Operação em andamento')).toBeInTheDocument()
    expect(screen.getByText('Aguardando recebimento')).toBeInTheDocument()
    expect(screen.getByText('Transferência aprovada')).toBeInTheDocument()
    expect(screen.getByText('Falha no áudio')).toBeInTheDocument()
    expect(screen.getByText('Termo.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Auditoria')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ver na central de movimentações/i })).toHaveAttribute('href', '/movimentacoes?search=PAT-2026-004821')
  })

  it('shows paged audit for DITEL and requests the next history page', async () => {
    vi.mocked(getPatrimonialView)
      .mockResolvedValueOnce({ ...view, history: { ...view.history, total: 2 } })
      .mockResolvedValueOnce({ ...view, history: { ...view.history, page: 2, items: [{ ...view.history.items[0], id: 'history-2', description: 'Transferência recebida' }], total: 2 } })

    const user = (await import('@testing-library/user-event')).default.setup()
    render(<MemoryRouter><PatrimonialOverview equipmentId="eq-001" canViewAudit /></MemoryRouter>)
    expect(await screen.findByText('Auditoria')).toBeInTheDocument()
    expect(screen.getByText('movements.decision')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próxima página do histórico' }))
    await waitFor(() => expect(screen.getByText('Transferência recebida')).toBeInTheDocument())
    expect(getPatrimonialView).toHaveBeenLastCalledWith('eq-001', { historyPage: 2, historyPageSize: 10, auditPage: 1, auditPageSize: 10 }, expect.any(AbortSignal))
  })

  it('renders empty and error states', async () => {
    vi.mocked(getPatrimonialView).mockResolvedValue({ ...view, activeOperation: null, history: { items: [], total: 0, page: 1, pageSize: 10 }, relatedCalls: [], documents: [], auditEvents: { items: [], total: 0, page: 1, pageSize: 10 } })
    render(<MemoryRouter><PatrimonialOverview equipmentId="eq-001" canViewAudit /></MemoryRouter>)
    expect(await screen.findByText('Nenhuma movimentação patrimonial registrada.')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma operação pendente.')).toBeInTheDocument()

    vi.mocked(getPatrimonialView).mockRejectedValueOnce(new Error('offline'))
    render(<MemoryRouter><PatrimonialOverview equipmentId="eq-002" canViewAudit /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a situação patrimonial.')
  })
})
