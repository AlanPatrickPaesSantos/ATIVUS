import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { UnitInventoryPage } from './UnitInventoryPage'
import { EquipmentDetailModal } from '../components/EquipmentDetailModal'
import { EquipmentDetailTabs } from '../components/EquipmentDetailTabs'
import { InventoryTable } from '../components/InventoryTable'
import type { EquipmentDetails } from '../../../shared/api/contracts'
import type { SessionContext } from '../../../shared/auth/types'

const queryState = vi.hoisted(() => ({
  result: {
    data: { items: [{ id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro' }], total: 20, page: 1, pageSize: 10 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}))

vi.mock('../api/inventoryQueries', () => ({ useInventoryQuery: () => queryState.result }))
const detailLoader = vi.hoisted(() => vi.fn(async () => ({ ...queryState.result.data.items[0], category: 'Informática', updatedAt: '2026-08-21T10:00:00.000Z', history: [], linkedCalls: [], documents: [], allocation: { location: 'Sala Administrativa' } })))
const inventoryApiState = vi.hoisted(() => ({ createEquipment: vi.fn(async () => ({ id: 'eq-created' })), updateEquipmentSituation: vi.fn(async (id: string, situation: string, updatedAt: string) => ({ id, patrimony: 'UC-001', situation, unitName: 'Unidade Centro', updatedAt, updatedBy: 'Ana Souza' })) }))
vi.mock('../api/inventoryApi', () => ({ getEquipmentDetails: detailLoader, createEquipment: inventoryApiState.createEquipment, updateEquipmentSituation: inventoryApiState.updateEquipmentSituation }))
vi.mock('../api/equipmentTypeQueries', () => ({ useEquipmentTypesQuery: () => ({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() }) }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

const baseSession: SessionContext = {
  userId: 'unit-001',
  name: 'Ana Souza',
  registration: '100001',
  role: 'unit_user',
  unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' },
}

const canvaSession: SessionContext = {
  ...baseSession,
  unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' },
}

const ditelSession: SessionContext = {
  userId: 'ditel-001',
  name: 'Carlos Lima',
  registration: '200001',
  role: 'ditel_admin',
  unit: { id: 'ditel', name: 'DITEL', acronym: 'DITEL' },
}

function renderPage(entry = '/inventario', session?: SessionContext) {
  return render(<MemoryRouter initialEntries={[entry]}><UnitInventoryPage session={session} /><LocationProbe /></MemoryRouter>)
}

afterEach(() => {
  queryState.result.isLoading = false
  queryState.result.isError = false
  queryState.result.data = { items: [{ id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro' }], total: 20, page: 1, pageSize: 10 }
  queryState.result.refetch = vi.fn()
  detailLoader.mockReset()
  detailLoader.mockImplementation(async () => ({ ...queryState.result.data.items[0], category: 'Informática', updatedAt: '2026-08-21T10:00:00.000Z', history: [], linkedCalls: [], documents: [], allocation: { location: 'Sala Administrativa' } }))
  inventoryApiState.createEquipment.mockReset()
  inventoryApiState.createEquipment.mockResolvedValue({ id: 'eq-created' })
  inventoryApiState.updateEquipmentSituation.mockReset()
  inventoryApiState.updateEquipmentSituation.mockImplementation(async (id: string, situation: string, updatedAt: string) => ({ id, patrimony: 'UC-001', situation, unitName: 'Unidade Centro', updatedAt, updatedBy: 'Ana Souza' }))
})

test('clears active filters from an empty inventory state', async () => {
  const user = userEvent.setup()
  queryState.result.data = { items: [], total: 0, page: 1, pageSize: 10 }
  renderPage('/inventario?search=sem-resultados&type=Notebook')

  expect(screen.getByText('Nenhum equipamento encontrado')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))

  expect(screen.getByTestId('location')).toHaveTextContent('/inventario')
})

test('offers a retry action when the inventory request fails', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn()
  queryState.result.isError = true
  queryState.result.refetch = refetch
  renderPage()

  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o inventário.')
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  expect(refetch).toHaveBeenCalledOnce()
})

test('links inventory users to the real report export flow', () => {
  renderPage()

  const exportLink = screen.getByRole('link', { name: 'Exportar' })
  expect(exportLink).toHaveAttribute('href', '/relatorios')
})

test('persists type and model filters in the URL and resets pagination', async () => {
  const user = userEvent.setup()
  renderPage('/inventario?page=3&pageSize=20')

  await user.selectOptions(screen.getByLabelText('Tipo'), 'Notebook')
  await user.selectOptions(screen.getByLabelText('Modelo'), 'ProBook')

  expect(screen.getByTestId('location')).toHaveTextContent('type=Notebook')
  expect(screen.getByTestId('location')).toHaveTextContent('model=ProBook')
  expect(screen.getByTestId('location')).not.toHaveTextContent('page=3')
  expect(screen.getByTestId('location')).toHaveTextContent('pageSize=20')
  expect(screen.queryByRole('combobox', { name: /unidade/i })).not.toBeInTheDocument()
})

test('keeps server pagination in the URL and opens an equipment detail modal', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.click(screen.getByRole('button', { name: 'Próxima página' }))
  expect(screen.getByTestId('location')).toHaveTextContent('page=2')

  await user.click(screen.getByRole('button', { name: /ver detalhes de UC-001/i }))
  expect(await screen.findByRole('dialog', { name: /equipamento UC-001/i })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Fechar' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('uses every documented equipment field in the registration preview', async () => {
  const user = userEvent.setup()
  renderPage('/inventario', canvaSession)

  await user.click(screen.getByRole('button', { name: /novo equipamento/i }))

  const dialog = screen.getByRole('dialog', { name: 'Cadastrar equipamento' })
  expect(dialog).toBeInTheDocument()
  expect(within(dialog).getByLabelText(/^Patrimônio/)).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Seção responsável')).toBeInTheDocument()
  expect(within(dialog).getByLabelText(/^Tipo/)).toBeInTheDocument()
  expect(within(dialog).getByLabelText(/^Tipo/)).toBeDisabled()
  expect(within(dialog).getByRole('option', { name: 'Selecione uma seção primeiro' })).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Número de série')).not.toBeRequired()
  expect(within(dialog).getByLabelText(/^Marca/)).toBeRequired()
  expect(within(dialog).getByLabelText('Modelo')).toBeDisabled()
  expect(within(dialog).getByLabelText('Garantia')).toBeInTheDocument()
  expect(within(dialog).getByText('Unidade responsável')).toBeInTheDocument()
  expect(within(dialog).getByText('3º BPM')).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Selecionar anexos')).toBeInTheDocument()
  const situation = within(dialog).getByLabelText('Situação')
  expect(within(situation).getByRole('option', { name: 'Ativo' })).toBeInTheDocument()
  expect(within(situation).getByRole('option', { name: 'Em manutenção' })).toBeInTheDocument()
  expect(within(situation).getByRole('option', { name: 'Baixado' })).toBeInTheDocument()
  expect(within(situation).getByRole('option', { name: 'Perdido' })).toBeInTheDocument()
  expect(within(situation).getByRole('option', { name: 'Inativo' })).toBeInTheDocument()

  await user.type(within(dialog).getByLabelText(/^Patrimônio/), 'PAT-2026-000999')
  await user.selectOptions(within(dialog).getByLabelText('Seção responsável'), 'support')
  expect(within(dialog).getByRole('option', { name: 'Computador portátil' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('option', { name: 'Rádio portátil' })).not.toBeInTheDocument()
  await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), 'Computador portátil')
  await user.selectOptions(within(dialog).getByLabelText('Modelo'), 'Dell Latitude 5420')
  await user.type(within(dialog).getByLabelText(/^Marca/), 'Dell')
  await user.click(within(dialog).getByRole('radio', { name: 'Sim' }))
  fireEvent.change(within(dialog).getByLabelText('Data da garantia'), { target: { value: '2027-03-12' } })
  await user.type(within(dialog).getByLabelText(/^Localização/), 'Sala de Comunicações')
  const document = new File(['documento'], 'termo.pdf', { type: 'application/pdf' })
  await user.upload(within(dialog).getByLabelText('Selecionar anexos'), document)
  expect(within(dialog).getByText('termo.pdf')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Continuar para revisão' })).toBeInTheDocument()

  await user.click(within(dialog).getByRole('button', { name: 'Continuar para revisão' }))
  expect(within(dialog).getByText('Histórico inicial')).toBeInTheDocument()
  expect(within(dialog).getByText('Cadastro inicial será registrado no histórico do equipamento.')).toBeInTheDocument()
  expect(within(dialog).getByText('termo.pdf')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Salvar equipamento' }))
  expect(inventoryApiState.createEquipment).toHaveBeenCalledWith(expect.objectContaining({ patrimony: 'PAT-2026-000999' }), [document])
})

test('presents the inventory page as the Canva operational console', async () => {
  const user = userEvent.setup()
  queryState.result.data = {
    items: [
      { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', situation: 'active', location: 'Sala de Comunicações', unitName: '3º BPM' },
      { id: 'eq-008', patrimony: 'PAT-2026-004828', type: 'Impressora', model: 'LaserJet M404', brand: 'HP', situation: 'inactive', location: 'Almoxarifado', unitName: '3º BPM' },
    ],
    total: 428,
    page: 1,
    pageSize: 10,
  }
  const radioDetails: EquipmentDetails = {
    id: 'eq-001',
    patrimony: 'PAT-2026-004821',
    type: 'Rádio portátil',
    model: 'APX 2000',
    brand: 'Motorola',
    situation: 'active',
    location: 'Sala de Comunicações',
    unitName: '3º BPM',
    category: 'Comunicação',
    serialNumber: 'APX2K26F7Q01234',
    warranty: 'Até 12/03/2027',
    allocation: { location: 'Sala de Comunicações', responsibleUser: 'Cb PM João Silva', allocatedAt: '2026-02-18' },
    history: [],
    linkedCalls: [{ id: 'CH-2026-01572', subject: 'Falha intermitente no áudio', status: 'Aberto', openedAt: '2026-05-10' }],
    documents: [{ id: 'manual-apx', name: 'Manual_APX2000.pdf', type: 'application/pdf', size: 1024, uploadedAt: '2026-08-20T10:00:00.000Z', status: 'active', downloadUrl: '/api/v1/attachments/manual-apx/download' }, { id: 'cert-anatel', name: 'Certificado_Anatel.pdf', type: 'application/pdf', size: 2048, uploadedAt: '2026-08-20T10:00:00.000Z', status: 'active', downloadUrl: '/api/v1/attachments/cert-anatel/download' }],
  }
  detailLoader.mockResolvedValueOnce(radioDetails as never)

  renderPage('/inventario', canvaSession)

  expect(screen.getByTestId('inventory-layout')).toHaveAttribute('data-visual-variant', 'operation-night')
  expect(screen.getByText('3º BPM • 428 equipamentos cadastrados')).toBeInTheDocument()
  expect(screen.getByText('Todos 428')).toBeInTheDocument()
  expect(screen.getByText(/Atenção\s+1/)).toBeInTheDocument()
  expect(screen.getByText('itens carregados nesta página')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /ver detalhes de PAT-2026-004821/i }))
  expect(await screen.findByRole('dialog', { name: /equipamento PAT-2026-004821/i })).toBeInTheDocument()
  expect(screen.getByText('Cb PM João Silva')).toBeInTheDocument()
})

test('keeps the operational identity and summary above the inventory workspace', () => {
  queryState.result.data = {
    items: [{ id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', situation: 'active', location: 'Sala de Comunicações', unitName: '3º BPM' }],
    total: 428,
    page: 1,
    pageSize: 10,
  }

  renderPage('/inventario', canvaSession)

  const pageHeader = screen.getByRole('heading', { name: 'Inventário da Unidade', level: 1 }).closest('.inventory-page__header')
  expect(pageHeader).toBeInTheDocument()
  expect(within(pageHeader as HTMLElement).getByText('3º BPM • 428 equipamentos cadastrados')).toBeInTheDocument()
  expect(within(pageHeader as HTMLElement).getByLabelText('Resumo do inventário')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Equipamentos da Unidade', level: 2 })).toBeInTheDocument()
})

test('gives DITEL a statewide inventory scope and a Unit filter', async () => {
  const user = userEvent.setup()
  renderPage('/inventario', ditelSession)

  expect(screen.getByText('Gestão estadual · DITEL')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Inventário estadual', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Equipamentos do estado', level: 2 })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Unidade monitorada' })).toBeInTheDocument()
  expect(screen.getAllByText('Escopo estadual')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: /\+ novo equipamento/i })).not.toBeInTheDocument()

  await user.selectOptions(screen.getByRole('combobox', { name: 'Unidade monitorada' }), 'unit-norte')
  expect(screen.getByTestId('location')).toHaveTextContent('unitId=unit-norte')
})

test('uses a compact mobile inventory layout without removing keyboard actions', () => {
  let matches = true
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ get matches() { return matches }, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  renderPage()
  expect(screen.getByTestId('inventory-layout')).toHaveAttribute('data-layout', 'mobile')
  expect(screen.getByRole('button', { name: /ver detalhes de UC-001/i })).toBeInTheDocument()
  matches = false
  fireEvent(window, new Event('resize'))
  expect(screen.getByTestId('inventory-layout')).toHaveAttribute('data-layout', 'desktop')
})

test('renders the shared EmptyState for a mobile inventory with no results', () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

  render(<InventoryTable items={[]} loading={false} error={false} isMobile onSelect={vi.fn()} onRetry={vi.fn()} onClearFilters={vi.fn()} />)

  expect(screen.getByText('Nenhum equipamento encontrado')).toBeInTheDocument()
  expect(screen.getByText('Revise os filtros aplicados ou limpe a busca para consultar todo o inventário.')).toBeInTheDocument()
})

test('shows equipment tabs, confirms a situation change and delegates the call handoff once', async () => {
  const user = userEvent.setup()
  const onOpenCall = vi.fn()
  render(<MemoryRouter><EquipmentDetailModal equipmentId="eq-001" open onClose={vi.fn()} onOpenCall={onOpenCall} /></MemoryRouter>)

  expect(await screen.findByRole('dialog', { name: /equipamento UC-001/i })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Editar equipamento' }))
  expect(screen.getByRole('alertdialog', { name: 'Confirmar alteração de situação' })).toHaveAttribute('data-visual-variant', 'status-confirmation')
  expect(screen.getByText('Ativo', { selector: '.status-change__current strong' })).toBeInTheDocument()
  expect(screen.getByText('Inativo', { selector: '.status-change__next strong' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirmar alteração' }))
  expect(screen.queryByRole('alertdialog', { name: 'Confirmar alteração de situação' })).not.toBeInTheDocument()
  expect(screen.getByText('Inativo', { selector: '.equipment-detail__status strong' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Resumo' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('tab', { name: 'Dados técnicos' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Número de série')
  await user.click(screen.getByRole('tab', { name: 'Histórico' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Sem histórico disponível')
  await user.click(screen.getByRole('tab', { name: 'Chamados' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Chamados vinculados')
  await user.click(screen.getByRole('button', { name: 'Abrir chamado' }))
  expect(onOpenCall).toHaveBeenCalledTimes(1)
  expect(onOpenCall).toHaveBeenCalledWith('eq-001')
})

test('hands an equipment id to the existing Calls route without creating a ticket', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.click(screen.getByRole('button', { name: /ver detalhes de UC-001/i }))
  await screen.findByRole('dialog', { name: /equipamento UC-001/i })
  await user.click(screen.getByRole('button', { name: 'Abrir chamado' }))

  expect(screen.getByTestId('location')).toHaveTextContent('/chamados?equipmentId=eq-001')
})

test('renders every available allocation, call and document field in the detail tabs', async () => {
  const user = userEvent.setup()
  const equipment: EquipmentDetails = {
    id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro', category: 'Informática',
    allocation: { location: 'Sala Administrativa', responsibleUser: 'Ana Souza', allocatedAt: '2025-02-10' },
    history: [], linkedCalls: [{ id: 'call-001', subject: 'Atualização de software', status: 'Em andamento', openedAt: '2026-08-20' }], documents: [{ id: 'document-001', name: 'Termo de responsabilidade.pdf', type: 'application/pdf', size: 1234, uploadedAt: '2026-08-20T10:00:00.000Z', status: 'active', downloadUrl: '/api/v1/attachments/document-001/download' }],
  }

  function ControlledTabs() {
    const [value, setValue] = useState('summary')
    return <EquipmentDetailTabs equipment={equipment} value={value} onChange={setValue} />
  }

  render(<ControlledTabs />)
  expect(screen.getByRole('tabpanel')).toHaveTextContent('10/02/2025')
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Ana Souza')
  await user.click(screen.getByRole('tab', { name: 'Chamados' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('20/08/2026')
  await user.click(screen.getByRole('tab', { name: 'Documentos' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('application/pdf')
  expect(screen.getByRole('link', { name: 'Termo de responsabilidade.pdf' })).toHaveAttribute('href', '/api/v1/attachments/document-001/download')
})

test('shows the documented registration data and preserves the lost situation label', () => {
  const equipment = {
    id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'lost', location: 'Sala Administrativa', unitName: 'Unidade Centro', category: 'Informática',
    serialNumber: 'SER-001', warranty: 'Sem garantia', observations: 'Lacre patrimonial conferido.', createdAt: '2026-08-20', createdBy: 'Ana Souza', updatedAt: '2026-08-21', updatedBy: 'Cb PM João Silva',
    allocation: { location: 'Sala Administrativa' }, history: [], linkedCalls: [], documents: [],
  } as EquipmentDetails

  function ControlledTabs() {
    const [value, setValue] = useState('summary')
    return <EquipmentDetailTabs equipment={equipment} value={value} onChange={setValue} />
  }

  render(<ControlledTabs />)

  expect(screen.getByText('Perdido')).toBeInTheDocument()
  expect(screen.getByText('Lacre patrimonial conferido.')).toBeInTheDocument()
  expect(screen.getByText('20/08/2026')).toBeInTheDocument()
  expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  expect(screen.getByText('21/08/2026')).toBeInTheDocument()
})

test('ignores a stale detail response after selecting another equipment', async () => {
  const user = userEvent.setup()
  let resolveFirst: ((value: unknown) => void) | undefined
  let resolveSecond: ((value: unknown) => void) | undefined
  const first = new Promise((resolve) => { resolveFirst = resolve })
  const second = new Promise((resolve) => { resolveSecond = resolve })
  vi.mocked((await import('../api/inventoryApi')).getEquipmentDetails)
    .mockImplementationOnce(() => first as never)
    .mockImplementationOnce(() => second as never)
  renderPage()

  await user.click(screen.getByRole('button', { name: /ver detalhes de UC-001/i }))
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: /ver detalhes de UC-001/i }))
  resolveFirst?.({ id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'Old', brand: 'HP', situation: 'active', location: 'Old', unitName: 'Unidade Centro', category: 'Informática', history: [], linkedCalls: [], documents: [], allocation: { location: 'Old' } })
  resolveSecond?.({ id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'Current', brand: 'HP', situation: 'active', location: 'Current', unitName: 'Unidade Centro', category: 'Informática', history: [], linkedCalls: [], documents: [], allocation: { location: 'Current' } })

  expect(await screen.findAllByText('Current')).not.toHaveLength(0)
  expect(screen.queryByText(/Old/)).not.toBeInTheDocument()
})
