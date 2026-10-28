import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OrganizationalStructurePage } from './OrganizationalStructurePage'
import { useOrganizationalIndicatorsQuery, useOrganizationalNodeQuery, useOrganizationalStructureQuery } from '../api/organizationalStructureQueries'

vi.mock('../api/organizationalStructureQueries', () => ({
  useOrganizationalIndicatorsQuery: vi.fn(),
  useOrganizationalNodeQuery: vi.fn(),
  useOrganizationalStructureQuery: vi.fn(),
}))

const list = {
  items: [{ id: 'unit-1', name: '1º BPM', acronym: '1BPM', kind: 'bpm' as const, parentUnitId: 'command-1', parent: { id: 'command-1', name: 'Comando 1', acronym: 'C1' }, independent: false, active: true, verificationStatus: 'confirmed' as const, childrenCount: 0, equipmentCount: 12, demonstrativeEquipmentCount: 12 }, { id: 'unit-pending', name: 'CPR XV', acronym: 'CPR XV', kind: 'other' as const, parentUnitId: null, parent: null, independent: false, active: true, verificationStatus: 'pending' as const, childrenCount: 0, equipmentCount: 0, demonstrativeEquipmentCount: 0 }],
  total: 2,
  page: 1,
  pageSize: 20,
}

function renderPage() {
  return render(<MemoryRouter><OrganizationalStructurePage /></MemoryRouter>)
}

describe('organizational structure page', () => {
  beforeEach(() => {
    vi.mocked(useOrganizationalStructureQuery).mockReturnValue({ data: list, isLoading: false, isError: false, refetch: vi.fn() } as never)
    vi.mocked(useOrganizationalNodeQuery).mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as never)
    vi.mocked(useOrganizationalIndicatorsQuery).mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as never)
  })

  it('renders loading, empty and error states', () => {
    vi.mocked(useOrganizationalStructureQuery).mockReturnValueOnce({ data: undefined, isLoading: true, isError: false } as never)
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Carregando estrutura estadual')
    cleanup()
    vi.mocked(useOrganizationalStructureQuery).mockReturnValue({ data: { ...list, items: [] }, isLoading: false, isError: false } as never)
    renderPage()
    expect(screen.getByRole('heading', { name: 'Estrutura estadual' })).toBeInTheDocument()
    expect(screen.getAllByText('Nenhuma organização encontrada').length).toBeGreaterThan(0)
    cleanup()
    vi.mocked(useOrganizationalStructureQuery).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as never)
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a estrutura estadual')
  })

  it('supports filters, pending status and inventory navigation', () => {
    renderPage()
    expect(screen.getAllByText('CPR XV').length).toBeGreaterThan(0)
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar organização'), { target: { value: 'BPM' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(useOrganizationalStructureQuery).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'BPM', page: 1 }))
    expect(screen.getByRole('link', { name: 'Abrir inventário de 1º BPM' })).toHaveAttribute('href', '/inventario?unitId=unit-1')
    expect(screen.getByRole('link', { name: 'Abrir relatório de 1º BPM' })).toHaveAttribute('href', '/relatorios?unitId=unit-1')
  })

  it('renders indicators for a selected organization and paginates', () => {
    vi.mocked(useOrganizationalNodeQuery).mockReturnValue({ data: { organization: list.items[0], children: [], indicators: { units: 1, equipment: { total: 12, demonstrative: 12 }, bySituation: { active: 10, maintenance: 2 }, byType: { Rádio: 12 }, children: [] } }, isLoading: false, isError: false } as never)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de 1º BPM' }))
    expect(screen.getByText('Equipamentos no escopo')).toBeInTheDocument()
    expect(screen.getAllByText('12').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled()
  })
})
