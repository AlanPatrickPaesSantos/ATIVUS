import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../../shared/api/msw/server'
import type { SessionContext } from '../../../shared/auth/types'
import { AcReportsPage } from './AcReportsPage'

const session: SessionContext = { userId: 'ac-1', name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null }
const report = {
  generatedAt: '2026-10-26T10:00:00.000Z', generatedBy: { name: 'Operador AC', role: 'ac_operator' },
  metrics: { availableStock: 2, distributedGoods: 1, transfers: 1 },
  criteria: { availableStock: 'Equipment distinto com custódia AC e situação active.', distributedGoods: 'equipmentId distinto em AcTransfer confirmado no recorte.', transfers: 'documentos AcTransfer confirmados no recorte.' },
  stock: { items: [{ id: 'eq-1', patrimony: 'RP-1', serialNumber: 'SN-1', identification: 'Motorola', brand: 'Motorola', type: 'Rádio', model: 'APX', situation: 'active' }], total: 1, page: 1, pageSize: 20 },
  distributions: { items: [], total: 0, page: 1, pageSize: 20 }, history: null,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><AcReportsPage session={session} /></MemoryRouter></QueryClientProvider>)
}

describe('AcReportsPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())

  beforeEach(() => {
    server.use(http.get('*/api/v1/ac/reports/patrimonial', () => HttpResponse.json(report)))
  })

  it('shows AC metrics and stock report', async () => {
    renderPage()
    expect(screen.getByRole('region', { name: 'Relatórios patrimoniais da AC' })).toHaveClass('ac-reports-page')
    expect(screen.getByRole('navigation', { name: 'Relatórios AC' })).toHaveClass('ac-report-tabs')
    expect(screen.getByRole('button', { name: 'Estoque atual' })).toHaveClass('ac-report-tabs__button')
    expect(screen.getByRole('heading', { name: 'Relatórios patrimoniais da AC' })).toBeInTheDocument()
    expect(await screen.findByText('RP-1')).toBeInTheDocument()
    expect(screen.getByText('Estoque disponível')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows a clear empty state when no rows match', async () => {
    server.use(http.get('*/api/v1/ac/reports/patrimonial', () => HttpResponse.json({ ...report, stock: { ...report.stock, items: [], total: 0 } })))
    renderPage()
    expect(await screen.findByText('Nenhum bem encontrado no recorte.')).toBeInTheDocument()
  })
})
