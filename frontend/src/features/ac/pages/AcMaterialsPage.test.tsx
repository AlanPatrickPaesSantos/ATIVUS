import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { AcMaterialsPage } from './AcMaterialsPage'

vi.mock('../api/acQueries', () => ({
  useAcMaterialsQuery: () => ({ data: { items: [{ id: '1', patrimony: 'AC-1', type: 'Rádio', model: 'X', brand: 'Y', situation: 'active', location: 'AC', unit: null, custody: { scope: 'AC', unit: null }, category: 'Comunicação', history: [] }], total: 1 }, isLoading: false, isError: false }),
  useAcMaterialQuery: () => ({ isLoading: false, isError: false }),
  useInvalidateAcQueries: () => vi.fn(),
}))

const session = { userId: 'ac', name: 'AC', registration: '1', role: 'ac_operator' as const, unit: null }
const renderPage = (role: 'ac_operator' | 'ditel_admin') => render(<QueryClientProvider client={new QueryClient()}><AcMaterialsPage session={{ ...session, role }} /></QueryClientProvider>)

describe('AcMaterialsPage', () => {
  it('lista materiais e mostra cadastro somente ao operador AC', () => {
    renderPage('ac_operator')
    expect(screen.getByRole('heading', { name: 'Materiais da AC' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cadastrar material/i })).toBeInTheDocument()
    expect(screen.getByText('AC-1')).toBeInTheDocument()
  })
  it('mantém a consulta para DITEL, sem exibir ação de cadastro', () => {
    renderPage('ditel_admin')
    expect(screen.queryByRole('button', { name: /cadastrar material/i })).not.toBeInTheDocument()
  })
})
