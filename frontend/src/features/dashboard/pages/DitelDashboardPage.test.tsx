import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { DitelDashboardPage } from './DitelDashboardPage'

const queryState = vi.hoisted(() => ({
  result: {
    data: undefined as unknown,
    error: null as Error | null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}))

vi.mock('../api/dashboardQueries', () => ({
  useDashboardQuery: () => queryState.result,
}))

const dashboard = {
  unit: { id: 'statewide', name: 'Estado do Pará', acronym: 'DITEL' },
  metrics: { total: 428, active: 360, maintenance: 47, attention: 0 },
  situations: [
    { situation: 'active', label: 'Em operação', count: 360 },
    { situation: 'maintenance', label: 'Em manutenção', count: 47 },
    { situation: 'inactive', label: 'Inativos', count: 21 },
    { situation: 'attention', label: 'Requer atenção', count: 0 },
  ],
  unitSummaries: [
    { unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, coverage: '84%', equipment: 128, attention: 9 },
  ],
  callsByStatus: [
    { status: 'Aberto', label: 'Aberto', count: 4 },
    { status: 'Em atendimento', label: 'Em atendimento', count: 2 },
  ],
  criticalCalls: 1,
  pendingMovements: 3,
  monitoredUnits: 2,
  recentMovements: [
    { id: 'mov-1', equipmentId: 'PAT-2026-004821', origin: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, destination: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, status: 'Pendente', occurredAt: '2026-09-15T10:00:00.000Z' },
  ],
  recentActivity: [],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DitelDashboardPage />
    </MemoryRouter>,
  )
}

function setQueryResult(result: Partial<typeof queryState.result>) {
  queryState.result = { ...queryState.result, data: undefined, error: null, isError: false, isLoading: false, refetch: vi.fn(), ...result }
}

afterEach(() => {
  setQueryResult({})
})

test('renders the statewide operations console with filters and API-backed metrics', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  expect(screen.getByTestId('ditel-operations-console')).toHaveAttribute('data-visual-variant', 'statewide-operations-console')
  expect(screen.getByRole('heading', { name: 'Painel estadual' })).toBeInTheDocument()
  expect(screen.queryByText('Gestão estadual · DITEL')).not.toBeInTheDocument()
  expect(screen.queryByText(/Leitura consolidada da cobertura patrimonial/i)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Unidade monitorada')).toHaveValue('statewide')
  expect(screen.getByLabelText('Situação do parque')).toHaveValue('all')
  expect(screen.getByRole('heading', { name: 'Unidades monitoradas' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Distribuição estadual do parque' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Centro estadual DITEL' })).toBeInTheDocument()
  expect(screen.queryByText('Leitura executiva')).not.toBeInTheDocument()
  expect(screen.queryByText('Composição do parque')).not.toBeInTheDocument()
  expect(screen.getByTestId('ditel-state-health')).toHaveTextContent('84%')
  expect(screen.getByTestId('ditel-park-distribution')).toHaveTextContent('Em operação')
})

test('renders API-backed metrics when the dashboard query has data', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  const metricsGrid = screen.getByLabelText('Indicadores estaduais')
  expect(within(metricsGrid).getByText('428')).toBeInTheDocument()
  expect(within(metricsGrid).getByText('47')).toBeInTheDocument()
  expect(within(metricsGrid).getByText('21')).toBeInTheDocument()
  expect(within(metricsGrid).getByText('Inativos')).toBeInTheDocument()
  expect(within(metricsGrid).queryByText('Requer atenção')).not.toBeInTheDocument()
  expect(within(metricsGrid).queryByText('1.248')).not.toBeInTheDocument()
  expect(within(metricsGrid).getByText('Em manutenção')).toBeInTheDocument()
})

test('renders detailed statewide dashboard panels from real API data', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  expect(screen.getByRole('heading', { name: 'Cobertura por unidade' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Ranking de atenção' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Chamados estaduais' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Fluxo patrimonial' })).toBeInTheDocument()

  const ranking = screen.getByTestId('ditel-unit-ranking')
  expect(within(ranking).getByText('3º BPM')).toBeInTheDocument()
  expect(within(ranking).getByText('9 pendências')).toBeInTheDocument()

  const calls = screen.getByTestId('ditel-calls-dashboard')
  expect(within(calls).getByText('Aberto')).toBeInTheDocument()
  expect(within(calls).getByText('4')).toBeInTheDocument()
  expect(within(calls).getByText('Em atendimento')).toBeInTheDocument()
  expect(within(calls).getByText('2')).toBeInTheDocument()
})

test('does not render simulated operational data when the dashboard query has no data', () => {
  setQueryResult({})

  renderPage()

  expect(screen.queryByLabelText('Indicadores estaduais')).not.toBeInTheDocument()
  expect(screen.queryByText('1.248')).not.toBeInTheDocument()
  expect(screen.queryByText('1189')).not.toBeInTheDocument()
  expect(screen.queryByText('12')).not.toBeInTheDocument()
})

test('renders unit coverage table from the dashboard API contract', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  expect(screen.getByRole('columnheader', { name: 'Unidade' })).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /3º BPM/ })).toBeInTheDocument()
  expect(screen.getByText('128')).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /3º BPM84%1289/ })).toBeInTheDocument()
  expect(screen.queryByText('184')).not.toBeInTheDocument()
  expect(screen.queryByText('98%')).not.toBeInTheDocument()
})

test('shows a readable loading state while the dashboard query is pending', () => {
  setQueryResult({ isLoading: true })

  renderPage()

  expect(screen.getByRole('status')).toHaveTextContent('Carregando painel estadual')
  expect(screen.queryByText('1.248')).not.toBeInTheDocument()
})

test('shows a retryable error without revealing protected dashboard data', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn()
  setQueryResult({ error: new Error('Falha de rede'), isError: true, refetch })

  renderPage()

  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o painel estadual.')
  expect(screen.queryByText('1.248')).not.toBeInTheDocument()
  expect(screen.queryByText('428')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(refetch).toHaveBeenCalledOnce()
})

test('renders real call and movement indicators from the dashboard API', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  const metricsGrid = screen.getByLabelText('Indicadores estaduais')
  expect(within(metricsGrid).getByText('1')).toBeInTheDocument()
  expect(within(metricsGrid).getByText('3')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Chamados estaduais' })).toBeInTheDocument()
  expect(screen.getByText('Aberto', { selector: 'li span' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Fluxo patrimonial' })).toBeInTheDocument()
  expect(screen.getByText(/3º BPM → Unidade Norte/)).toBeInTheDocument()
})

test('shows empty states when there are no calls or movements', () => {
  setQueryResult({ data: { ...dashboard, callsByStatus: [], recentMovements: [] } })

  renderPage()

  expect(screen.getByText('Nenhum chamado no escopo atual.')).toBeInTheDocument()
  expect(screen.getByText('Nenhuma movimentação recente.')).toBeInTheDocument()
})

test('does not render protected data in empty or error states', async () => {
  setQueryResult({})

  renderPage()

  expect(screen.queryByLabelText('Chamados por status')).not.toBeInTheDocument()
  expect(screen.queryByText('Movimentações recentes')).not.toBeInTheDocument()
})

