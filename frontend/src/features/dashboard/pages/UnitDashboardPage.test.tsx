import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { SessionContext } from '../../../shared/auth/types'
import { UnitDashboardPage } from './UnitDashboardPage'

const queryState = vi.hoisted(() => ({
  result: {
    data: undefined as unknown,
    error: null as Error | null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}))

const inventoryQueryState = vi.hoisted(() => ({
  result: {
    data: {
      items: [
        { id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro' },
      ],
      total: 1,
      page: 1,
      pageSize: 5,
    },
    isLoading: false,
    isError: false,
  },
}))

vi.mock('../api/dashboardQueries', () => ({
  useDashboardQuery: () => queryState.result,
}))

vi.mock('../../inventory/api/inventoryQueries', () => ({
  useInventoryQuery: () => inventoryQueryState.result,
}))

const unitSession: SessionContext = {
  userId: 'unit-001',
  name: 'Ana Souza',
  registration: '100001',
  role: 'unit_user',
  unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' },
}

const dashboard = {
  unit: unitSession.unit,
  metrics: { total: 4, active: 2, maintenance: 1, attention: 1 },
  situations: [
    { situation: 'active', label: 'Em operação', count: 2 },
    { situation: 'maintenance', label: 'Em manutenção', count: 1 },
    { situation: 'attention', label: 'Requer atenção', count: 1 },
  ],
  recentActivity: [
    { id: 'activity-1', description: 'Notebook UC-001 teve situação atualizada.', occurredAt: 'Hoje, 09:30' },
  ],
}

function renderDashboard(session = unitSession) {
  return render(<MemoryRouter><UnitDashboardPage session={session} /></MemoryRouter>)
}

function setQueryResult(result: Partial<typeof queryState.result>) {
  queryState.result = { ...queryState.result, data: undefined, error: null, isError: false, isLoading: false, refetch: vi.fn(), ...result }
}

afterEach(() => {
  setQueryResult({})
  inventoryQueryState.result = {
    data: {
      items: [
        { id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro' },
      ],
      total: 1,
      page: 1,
      pageSize: 5,
    },
    isLoading: false,
    isError: false,
  }
})

test('renders equipment metrics, situation summary and recent activity for the authenticated Unit', () => {
  setQueryResult({ data: dashboard })

  renderDashboard()

  expect(screen.getByRole('heading', { name: 'Painel da Unidade' })).toBeInTheDocument()
  expect(screen.getByText(/Unidade Centro · visão atualizada/i)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Total de equipamentos' })).toBeInTheDocument()
  expect(screen.getByLabelText('Métricas de equipamentos')).toHaveAttribute('data-visual-variant', 'operational-metrics')
  expect(screen.getByText('4')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Cadastrar equipamento' })).toHaveAttribute('href', '/inventario')
  expect(screen.getByRole('heading', { name: 'Equipamentos da Unidade' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Atenção operacional' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Evolução das manutenções' })).toBeInTheDocument()
  expect(screen.getByLabelText('Mai: 1 manutenção')).toBeInTheDocument()
  expect(screen.getByLabelText('Jul: 3 manutenções')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Filtrar por situação' })).toHaveClass('unit-inventory-snapshot__situation-trigger')
  expect(screen.getByRole('heading', { name: 'Dados pendentes' })).toBeInTheDocument()
  expect(screen.getByText('Notebook UC-001 teve situação atualizada.')).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: /unidade/i })).not.toBeInTheDocument()
})

test('uses a compact situation menu that applies an option and closes', async () => {
  const user = userEvent.setup()
  setQueryResult({ data: dashboard })

  renderDashboard()

  const trigger = screen.getByRole('button', { name: 'Filtrar por situação' })
  await user.click(trigger)
  expect(screen.getByRole('listbox', { name: 'Filtrar por situação' })).toBeInTheDocument()
  await user.click(screen.getByRole('option', { name: 'Em manutenção' }))
  expect(trigger).toHaveTextContent('Em manutenção')
  expect(screen.queryByRole('listbox', { name: 'Filtrar por situação' })).not.toBeInTheDocument()
})

test('renders accessible headers and cells for the unit inventory snapshot', () => {
  setQueryResult({ data: dashboard })

  renderDashboard()

  const snapshotTable = screen.getByRole('table', { name: 'Resumo de equipamentos da Unidade' })
  expect(within(snapshotTable).getByRole('columnheader', { name: 'Patrimônio' })).toBeInTheDocument()
  expect(within(snapshotTable).getByRole('columnheader', { name: 'Tipo / modelo' })).toBeInTheDocument()
  expect(within(snapshotTable).getByRole('columnheader', { name: 'Situação' })).toBeInTheDocument()
  expect(within(snapshotTable).getByRole('columnheader', { name: 'Localização' })).toBeInTheDocument()
  expect(within(screen.getByRole('row', { name: /UC-001/ })).getAllByRole('cell')).toHaveLength(4)
})

test('closes the situation menu with Escape', async () => {
  const user = userEvent.setup()
  setQueryResult({ data: dashboard })

  renderDashboard()

  const trigger = screen.getByRole('button', { name: 'Filtrar por situação' })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('listbox', { name: 'Filtrar por situação' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('moves through situation options with arrow keys', async () => {
  const user = userEvent.setup()
  setQueryResult({ data: dashboard })

  renderDashboard()

  const trigger = screen.getByRole('button', { name: 'Filtrar por situação' })
  await user.click(trigger)
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('option', { name: 'Ativo' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(trigger).toHaveTextContent('Ativo')
})

test('shows a readable loading state while the dashboard query is pending', () => {
  setQueryResult({ isLoading: true })

  renderDashboard()

  expect(screen.getByRole('status')).toHaveTextContent('Carregando painel da Unidade')
  expect(screen.queryByText('Notebook UC-001 teve situação atualizada.')).not.toBeInTheDocument()
})

test('shows a retryable error without protected dashboard data', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn()
  setQueryResult({ data: dashboard, error: new Error('Falha de rede'), isError: true, refetch })

  renderDashboard()

  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o painel da Unidade.')
  expect(screen.queryByRole('heading', { name: /Painel da Unidade/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Equipamentos cadastrados' })).not.toBeInTheDocument()
  expect(screen.queryByText('Notebook UC-001 teve situação atualizada.')).not.toBeInTheDocument()
  expect(screen.queryByText('4')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(refetch).toHaveBeenCalledOnce()
})

test('renders the Unit returned by the session-scoped dashboard without a Unit selector', () => {
  const norteSession: SessionContext = {
    ...unitSession,
    unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
  }
  setQueryResult({ data: { ...dashboard, unit: norteSession.unit } })

  renderDashboard(norteSession)

  expect(screen.getByRole('heading', { name: 'Painel da Unidade' })).toBeInTheDocument()
  expect(screen.getByText(/Unidade Norte · visão atualizada/i)).toBeInTheDocument()
  expect(screen.queryByText(/Unidade Centro · visão atualizada/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: /unidade/i })).not.toBeInTheDocument()
})
