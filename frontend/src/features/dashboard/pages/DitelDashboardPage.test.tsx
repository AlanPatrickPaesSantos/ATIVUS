import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

vi.mock('../../inventory/api/inventoryQueries', () => ({
  useInventoryFacetsQuery: () => ({ data: { units: [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }], types: ['Notebook'], models: ['ProBook'], situations: ['active', 'maintenance'], municipalities: ['Belém'], regions: ['Metropolitana'], sections: ['Suporte'] }, isError: false, refetch: vi.fn() }),
  useOrganizationalFilterOptionsQuery: () => ({ data: { commands: [{ id: 'command-north', name: 'CPRM', acronym: 'CPRM', equipmentCount: 9, units: [{ id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN', kind: 'bpm', parentUnitId: 'command-north', equipmentCount: 1 }] }], units: [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM', kind: 'bpm', parentUnitId: null, equipmentCount: 9 }] }, isLoading: false, isError: false, refetch: vi.fn() }),
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
  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="location">{location.search}</div>
  }
  return render(
    <MemoryRouter>
      <DitelDashboardPage /><LocationProbe />
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
  expect(screen.getByRole('region', { name: 'Filtros estaduais' })).toHaveClass('ditel-filters--compact')
  expect(screen.getByRole('heading', { name: 'Painel estadual' })).toBeInTheDocument()
  expect(screen.queryByText('Gestão estadual · DITEL')).not.toBeInTheDocument()
  expect(screen.queryByText(/Leitura consolidada da cobertura patrimonial/i)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Unidade subordinada')).toHaveValue('statewide')
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

  const primaryKpis = screen.getByTestId('ditel-primary-kpis')
  const secondaryIndicators = screen.getByTestId('ditel-secondary-indicators')
  expect(within(primaryKpis).getByText('428')).toBeInTheDocument()
  expect(within(primaryKpis).getByText('Em operação')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('47')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('21')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('Inativos')).toBeInTheDocument()
  expect(within(primaryKpis).queryByText('Requer atenção')).not.toBeInTheDocument()
  expect(within(primaryKpis).queryByText('1.248')).not.toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('Em manutenção')).toBeInTheDocument()
})

test('organizes the dashboard into four primary KPIs and compact secondary indicators', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  const primaryKpis = screen.getByTestId('ditel-primary-kpis')
  expect(within(primaryKpis).getByText('Equipamentos cadastrados')).toBeInTheDocument()
  expect(within(primaryKpis).getByText('Em operação')).toBeInTheDocument()
  expect(within(primaryKpis).getByText('Equipamentos em atenção')).toBeInTheDocument()
  expect(within(primaryKpis).getByText('% em atenção')).toBeInTheDocument()
  expect(within(primaryKpis).queryByText('Em manutenção')).not.toBeInTheDocument()

  const secondaryIndicators = screen.getByTestId('ditel-secondary-indicators')
  expect(within(secondaryIndicators).getByText('Em manutenção')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('Perdidos')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('Baixados')).toBeInTheDocument()
})

test('renders explicit operational indicators and attention percentage', () => {
  setQueryResult({ data: {
    ...dashboard,
    operationalIndicators: { total: 428, active: 360, maintenance: 47, inactive: 12, lost: 7, writtenOff: 2, attention: 9, attentionPercent: 2 },
  } })

  renderPage()

  const primaryKpis = screen.getByTestId('ditel-primary-kpis')
  const secondaryIndicators = screen.getByTestId('ditel-secondary-indicators')
  expect(within(primaryKpis).getByText('Equipamentos em atenção')).toBeInTheDocument()
  expect(within(primaryKpis).getByText('2%')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('Perdidos')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('Baixados')).toBeInTheDocument()
})

test('renders detailed statewide dashboard panels from real API data', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  expect(screen.queryByRole('heading', { name: 'Cobertura por unidade' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Comparação por comando' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Unidades monitoradas' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Chamados estaduais' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Fluxo patrimonial' })).toBeInTheDocument()

  const unitsPanel = screen.getByRole('region', { name: 'Unidades monitoradas' })
  expect(within(unitsPanel).getByText('3º BPM')).toBeInTheDocument()
  expect(within(unitsPanel).getByText('9')).toBeInTheDocument()

  const calls = screen.getByTestId('ditel-calls-dashboard')
  expect(within(calls).getByText('Aberto')).toBeInTheDocument()
  expect(within(calls).getByText('4')).toBeInTheDocument()
  expect(within(calls).getByText('Em atendimento')).toBeInTheDocument()
  expect(within(calls).getByText('2')).toBeInTheDocument()
})

test('consolidates unit monitoring and attention ranking with explicit sorting', async () => {
  const user = userEvent.setup()
  const manyUnits = [
    { unit: { id: 'unit-a', name: 'Unidade A', acronym: 'A' }, coverage: '50%', equipment: 100, attention: 2 },
    { unit: { id: 'unit-b', name: 'Unidade B', acronym: 'B' }, coverage: '50%', equipment: 10, attention: 5 },
  ]
  setQueryResult({ data: { ...dashboard, unitSummaries: manyUnits } })

  renderPage()

  const unitsPanel = screen.getByRole('region', { name: 'Unidades monitoradas' })
  expect(within(unitsPanel).getByLabelText('Ordenar unidades por')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Ranking de atenção' })).not.toBeInTheDocument()

  await user.selectOptions(within(unitsPanel).getByLabelText('Ordenar unidades por'), 'equipment')
  expect(within(unitsPanel).getByRole('row', { name: /Unidade A/ })).toBeInTheDocument()
  expect(within(unitsPanel).getByText('Ordenadas por total de equipamentos')).toBeInTheDocument()
})

test('limits unit and attention lists to five items until expanded', async () => {
  const user = userEvent.setup()
  const manyUnits = Array.from({ length: 7 }, (_, index) => ({
    unit: { id: `unit-${index}`, name: `Unidade ${index + 1}`, acronym: `U${index + 1}` },
    coverage: '10%', equipment: 10 + index, attention: index,
  }))
  setQueryResult({ data: { ...dashboard, unitSummaries: manyUnits } })

  renderPage()

  const unitsPanel = screen.getByRole('region', { name: 'Unidades monitoradas' })
  expect(within(unitsPanel).getAllByRole('row')).toHaveLength(6)
  await user.click(within(unitsPanel).getByRole('button', { name: 'Ver todas as unidades' }))
  expect(within(unitsPanel).getByText('Unidade 6')).toBeInTheDocument()
  expect(within(unitsPanel).getAllByRole('row')).toHaveLength(8)
  expect(within(unitsPanel).getByRole('button', { name: 'Mostrar menos unidades' })).toBeInTheDocument()

})

test('does not render the removed command comparison panel', () => {
  setQueryResult({ data: {
    ...dashboard,
    commandSummaries: [
      { command: { id: 'command-north', name: 'CPRM', acronym: 'CPRM' }, equipment: 200, attention: 4, attentionPercent: 2 },
    ],
  } })

  renderPage()

  expect(screen.queryByRole('region', { name: 'Comparação por comando' })).not.toBeInTheDocument()
})

test('sorts units by descriptive attention percentage with zero denominators', () => {
  setQueryResult({ data: {
    ...dashboard,
    unitSummaries: [
      { unit: { id: 'unit-a', name: 'Unidade A', acronym: 'A' }, coverage: '50%', equipment: 100, attention: 2 },
      { unit: { id: 'unit-b', name: 'Unidade B', acronym: 'B' }, coverage: '50%', equipment: 10, attention: 5 },
    ],
  } })

  renderPage()

  const unitsPanel = screen.getByRole('region', { name: 'Unidades monitoradas' })
  const unitBRow = within(unitsPanel).getByRole('row', { name: /Unidade B/ })
  expect(unitBRow).toHaveTextContent('50%')
})

test('navigates to inventory preserving supported dashboard filters', async () => {
  const user = userEvent.setup()
  setQueryResult({ data: dashboard })
  renderPage()

  await user.selectOptions(screen.getByLabelText('Comando intermediário'), 'command-north')
  await user.click(screen.getByRole('button', { name: 'Filtros avançados' }))
  await user.selectOptions(screen.getByLabelText('Tipo de equipamento'), 'Notebook')

  expect(screen.getByRole('link', { name: 'Consultar inventário estadual' })).toHaveAttribute('href', '/inventario?commandId=command-north&type=Notebook')
})

test('does not render simulated operational data when the dashboard query has no data', () => {
  setQueryResult({})

  renderPage()

  expect(screen.queryByLabelText('Indicadores estaduais')).not.toBeInTheDocument()
  expect(screen.queryByText('1.248')).not.toBeInTheDocument()
  expect(screen.queryByText('1189')).not.toBeInTheDocument()
  expect(screen.queryByText('12')).not.toBeInTheDocument()
})

test('renders unit participation and attention table from the dashboard API contract', () => {
  setQueryResult({ data: dashboard })

  renderPage()

  expect(screen.getByRole('columnheader', { name: 'Unidade' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Participação no recorte' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: '% em atenção' })).toBeInTheDocument()
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

  const secondaryIndicators = screen.getByTestId('ditel-secondary-indicators')
  expect(within(secondaryIndicators).getByText('1')).toBeInTheDocument()
  expect(within(secondaryIndicators).getByText('3')).toBeInTheDocument()
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

test('synchronizes dashboard filters with the URL and requests a server recorte', async () => {
  const user = userEvent.setup()
  setQueryResult({ data: dashboard })
  renderPage()

  await user.selectOptions(screen.getByLabelText('Unidade subordinada'), 'unit-centro')
  await user.click(screen.getByRole('button', { name: 'Filtros avançados' }))
  await user.selectOptions(screen.getByLabelText('Município'), 'Belém')
  await user.selectOptions(screen.getByLabelText('Tipo de equipamento'), 'Notebook')
  await user.selectOptions(screen.getByLabelText('Período'), '90d')

  expect(screen.getByTestId('location')).toHaveTextContent('unitId=unit-centro')
  expect(screen.getByTestId('location')).toHaveTextContent('municipality=Bel%C3%A9m')
  expect(screen.getByTestId('location')).toHaveTextContent('type=Notebook')
  expect(screen.getByTestId('location')).toHaveTextContent('period=90d')
})

test('keeps subordinate options dependent on the command and clears an incompatible unit', async () => {
  const user = userEvent.setup()
  setQueryResult({ data: dashboard })
  renderPage()

  await user.selectOptions(screen.getByLabelText('Unidade subordinada'), 'unit-centro')
  await user.selectOptions(screen.getByLabelText('Comando intermediário'), 'command-north')

  expect(screen.getByTestId('location')).toHaveTextContent('commandId=command-north')
  expect(screen.getByTestId('location')).not.toHaveTextContent('unitId=unit-centro')
  expect(screen.getByLabelText('Unidade subordinada')).toHaveValue('statewide')
  expect(screen.getByRole('option', { name: 'Unidade Norte' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '3º BPM' })).not.toBeInTheDocument()
})

