import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AcTransfersPage } from './AcTransfersPage'

const { getAcTransferDocument } = vi.hoisted(() => ({ getAcTransferDocument: vi.fn(async () => new Blob(['document'])) }))
vi.mock('../api/acApi', () => ({ createAcTransfer: vi.fn(), getAcTransferDocument }))

const transfer = { id: 'transfer-1', origin: 'AC' as const, status: 'confirmed' as const, destinationUnit: { id: 'u1', name: 'Unidade Norte', acronym: 'UN' }, distributedAt: '2026-10-26', deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' }, materials: [{ equipmentId: '1', patrimony: 'RP-1', sourceCustody: { scope: 'AC' as const, unit: null }, equipmentUpdatedAt: '2026-10-25', equipmentVersion: 0 }], createdAt: '2026-10-26', createdBy: 'ac' }

vi.mock('../api/acQueries', () => ({
  useAcMaterialsQuery: () => ({ data: { items: [{ id: '1', patrimony: 'AC-1', type: 'Rádio', model: 'X', brand: 'Y', situation: 'active', location: 'AC', unit: null, custody: { scope: 'AC', unit: null }, category: 'Comunicação', history: [] }] }, isLoading: false, isError: false }),
  useAcTransfersQuery: () => ({ data: { items: [transfer], total: 1 }, isLoading: false, isError: false }),
  useAcTransferQuery: () => ({ data: transfer, isLoading: false, isError: false }),
  useInvalidateAcQueries: () => vi.fn(),
}))
vi.mock('../../movements/api/unitsApi', () => ({ getUnits: vi.fn(async () => ({ items: [{ id: 'u1', name: 'Unidade Norte', acronym: 'UN' }] })) }))

describe('AcTransfersPage', () => {
  it('expõe o estoque AC e a confirmação sem aprovação posterior', async () => {
    render(<QueryClientProvider client={new QueryClient()}><AcTransfersPage session={{ userId: 'ac', name: 'AC', registration: '1', role: 'ac_operator', unit: null }} /></QueryClientProvider>)
    expect(screen.getByRole('heading', { name: 'Transferências AC' })).toBeInTheDocument()
    expect(screen.getByText(/AC-1/)).toBeInTheDocument()
    expect(screen.getByText(/Histórico de transferências/)).toBeInTheDocument()
  })
  it('não renderiza o formulário de confirmação para DITEL', () => {
    render(<QueryClientProvider client={new QueryClient()}><AcTransfersPage session={{ userId: 'admin', name: 'DITEL', registration: '2', role: 'ditel_admin', unit: null }} /></QueryClientProvider>)
    expect(screen.queryByRole('button', { name: /revisar distribuição/i })).not.toBeInTheDocument()
  })

  it('expõe exportação DOCX e PDF no detalhe da transferência', async () => {
    const user = userEvent.setup()
    render(<QueryClientProvider client={new QueryClient()}><AcTransfersPage session={{ userId: 'admin', name: 'DITEL', registration: '2', role: 'ditel_admin', unit: null }} /></QueryClientProvider>)
    expect(screen.getByRole('button', { name: 'Exportar DOCX da transferência transfer-1' })).toBeInTheDocument()
    await user.click(screen.getByText('2026-10-26'))
    expect(screen.getByRole('button', { name: 'Exportar DOCX' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Exportar DOCX' }))
    expect(getAcTransferDocument).toHaveBeenCalledWith('transfer-1', 'docx')
  })
})
