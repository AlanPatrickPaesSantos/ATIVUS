import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { CallsPage } from './CallsPage'

const inventoryState = vi.hoisted(() => ({
  getInventory: vi.fn(async () => ({
    items: [
      { id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro' },
      { id: 'eq-003', patrimony: 'UC-003', type: 'Impressora', model: 'LaserJet', brand: 'HP', situation: 'maintenance', location: 'Almoxarifado', unitName: 'Unidade Centro' },
    ], total: 45, page: 1, pageSize: 20,
  })),
  getEquipmentDetails: vi.fn(async () => ({ id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro', category: 'Informática', allocation: { location: 'Sala Administrativa' }, history: [], linkedCalls: [], documents: [] })),
}))

const callDetailsFixture = vi.hoisted(() => ({
  id: 'call-402',
  protocol: 'CH-2026-0402',
  problem: 'radio',
  subject: 'Rádio operacional indisponível',
  unitId: 'unit-centro',
  unitName: 'Unidade Centro',
  unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' },
  priority: 'Crítica',
  status: 'Em atendimento',
  section: 'Telecom',
  description: 'Descrição persistida pela API para a Unidade.',
  requestedBy: 'Operador persistido',
  equipment: { id: 'eq-001', patrimony: 'UC-001', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' },
  openedAt: '2026-08-30T08:01:00.000Z',
  updatedAt: '2026-08-30T08:01:00.000Z',
  attachments: [{ id: 'att-call-402', name: 'evidencia.pdf', type: 'application/pdf', size: 512, uploadedAt: '2026-08-30T08:02:00.000Z', status: 'active', downloadUrl: '/api/v1/attachments/att-call-402/download' }],
  history: [{ id: 'call-opened-call-402', description: 'Chamado aberto pela Unidade.', occurredAt: '2026-08-30T08:01:00.000Z' }],
}))

const callsState = vi.hoisted(() => ({ submitCall: vi.fn(async () => ({ id: 'call-900', protocol: 'CH-2026-900' })), getCalls: vi.fn(async () => ({ items: [{ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em atendimento' }] })), getCallDetails: vi.fn(async () => callDetailsFixture) }))

vi.mock('../../inventory/api/inventoryApi', () => ({ getInventory: inventoryState.getInventory, getEquipmentDetails: inventoryState.getEquipmentDetails }))
vi.mock('../api/callsApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/callsApi')>()), submitCall: callsState.submitCall, getCalls: callsState.getCalls, getCallDetails: callsState.getCallDetails }))

function renderPage(entry = '/chamados') {
  return render(<MemoryRouter initialEntries={[entry]}><CallsPage /></MemoryRouter>)
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText('Problema'), 'software')
  await user.type(screen.getByLabelText('Assunto'), 'Sistema não inicia')
  await user.type(screen.getByLabelText('Descrição'), 'O sistema exibe uma mensagem de erro ao iniciar.')
}

afterEach(() => {
  inventoryState.getInventory.mockReset()
  callsState.submitCall.mockReset()
  callsState.submitCall.mockResolvedValue({ id: 'call-900', protocol: 'CH-2026-900' })
  callsState.getCalls.mockReset()
  callsState.getCalls.mockResolvedValue({ items: [{ id: 'call-402', subject: 'Rádio operacional indisponível', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Crítica', status: 'Em atendimento' }] })
  callsState.getCallDetails.mockReset()
  callsState.getCallDetails.mockResolvedValue(callDetailsFixture)
  inventoryState.getInventory.mockResolvedValue({
    items: [
      { id: 'eq-001', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro' },
      { id: 'eq-003', patrimony: 'UC-003', type: 'Impressora', model: 'LaserJet', brand: 'HP', situation: 'maintenance', location: 'Almoxarifado', unitName: 'Unidade Centro' },
    ], total: 45, page: 1, pageSize: 20,
  })
})

test('routes the selected problem automatically and never offers a section selector', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.selectOptions(await screen.findByLabelText('Problema'), 'radio')

  expect(screen.getByText('Telecom').closest('output')).toHaveTextContent('Seção responsável: Telecom')
  expect(screen.queryByLabelText(/seção responsável/i)).not.toBeInTheDocument()
})

test('allows the unit to choose an initial priority and shows it in review', async () => {
  const user = userEvent.setup()
  renderPage()
  await fillRequiredFields(user)

  await user.selectOptions(screen.getByLabelText('Prioridade inicial'), 'critical')
  await user.click(screen.getByRole('button', { name: 'Revisar chamado' }))

  expect(screen.getAllByText('Crítica').length).toBeGreaterThan(0)
})

test('identifies the unit call journey as an operational flow', async () => {
  renderPage()

  expect(await screen.findByTestId('calls-operation-flow')).toHaveAttribute('data-visual-variant', 'operational-call-flow')
})

test('starts with the unit call queue and offers opening a new call', async () => {
  renderPage()

  expect(await screen.findByRole('heading', { name: 'Meus chamados' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Abrir chamado' })).toBeInTheDocument()
})

test('shows only current contract statuses in the unit call filters', async () => {
  renderPage()

  const filters = await screen.findByLabelText('Filtros de situação')

  expect(within(filters).getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Todos',
    'Aberto',
    'Em análise',
    'Em atendimento',
    'Aguardando informação',
    'Resolvido',
    'Encerrado',
  ])
  expect(within(filters).queryByRole('button', { name: 'Encaminhado para manutenção' })).not.toBeInTheDocument()
  expect(within(filters).queryByRole('button', { name: 'Cancelado' })).not.toBeInTheDocument()
})

test('shows explicit loading and retry states when the call queue cannot be loaded', async () => {
  const user = userEvent.setup()
  let rejectFirstLoad: ((reason?: unknown) => void) | undefined
  callsState.getCalls
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirstLoad = reject }) as ReturnType<typeof callsState.getCalls>)
    .mockResolvedValueOnce({ items: [{ id: 'call-410', subject: 'Impressora sem conexão', unitId: 'unit-centro', unitName: 'Unidade Centro', priority: 'Alta', status: 'Em análise' }] })

  renderPage()

  expect(await screen.findByText('Carregando chamados da Unidade')).toBeInTheDocument()

  rejectFirstLoad?.(new Error('offline'))

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os chamados da Unidade.')
  expect(screen.queryByText('Nenhum chamado encontrado para este filtro.')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  expect(await screen.findByText('Impressora sem conexão')).toBeInTheDocument()
  expect(callsState.getCalls).toHaveBeenCalledTimes(2)
})

test('opens call details when a queue item is selected', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.click(await screen.findByText('Rádio operacional indisponível'))

  const dialog = screen.getByRole('dialog', { name: 'Detalhes do chamado' })
  expect(dialog).toBeInTheDocument()
  expect(screen.getByText('Resumo')).toBeInTheDocument()
  expect(callsState.getCallDetails).toHaveBeenCalledWith('call-402')
  expect(await within(dialog).findByText('Descrição persistida pela API para a Unidade.')).toBeInTheDocument()
  expect(within(dialog).getByRole('link', { name: 'evidencia.pdf' })).toHaveAttribute('href', '/api/v1/attachments/att-call-402/download')
  await user.click(within(dialog).getByRole('tab', { name: 'Equipamentos' }))
  expect(within(dialog).getByText('Rádio portátil · UC-001')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('tab', { name: 'Histórico' }))
  expect(within(dialog).getByText('Chamado aberto pela Unidade.')).toBeInTheDocument()
  expect(within(dialog).queryByText('O rádio operacional apresenta falha de comunicação e não completa transmissões. A equipe da Unidade solicita avaliação técnica.')).not.toBeInTheDocument()
  const closeDialogButton = within(dialog).getByLabelText('Fechar')
  expect(closeDialogButton).toHaveClass('modal-dialog__close')
  expect(screen.getByText('Linha do tempo do chamado')).toBeInTheDocument()
  await user.click(closeDialogButton)
  expect(screen.queryByRole('dialog', { name: 'Detalhes do chamado' })).not.toBeInTheDocument()
})

test('shows call detail loading, error and retry for the unit modal', async () => {
  const user = userEvent.setup()
  let rejectDetails!: (reason?: unknown) => void
  callsState.getCallDetails
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectDetails = reject }) as ReturnType<typeof callsState.getCallDetails>)
    .mockResolvedValueOnce({ ...callDetailsFixture, description: 'Detalhe da Unidade recuperado após retry.' })
  renderPage()

  await user.click(await screen.findByText('Rádio operacional indisponível'))
  const dialog = screen.getByRole('dialog', { name: 'Detalhes do chamado' })
  expect(within(dialog).getByRole('status')).toHaveTextContent('Carregando detalhes do chamado')

  rejectDetails(new Error('offline'))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível carregar os detalhes do chamado.')
  await user.click(within(dialog).getByRole('button', { name: 'Tentar carregar detalhes novamente' }))

  expect(await within(dialog).findByText('Detalhe da Unidade recuperado após retry.')).toBeInTheDocument()
  expect(callsState.getCallDetails).toHaveBeenCalledTimes(2)
})

test('preselects equipment passed by the inventory handoff', async () => {
  renderPage('/chamados?equipmentId=eq-001')

  expect(await screen.findByLabelText('Equipamento associado')).toHaveValue('eq-001')
  expect(screen.getByText('UC-001 · Notebook HP ProBook')).toBeInTheDocument()
})

test('uses server search and pagination instead of a fixed association limit', async () => {
  const user = userEvent.setup()
  renderPage()

  expect(inventoryState.getInventory).toHaveBeenCalledWith({ page: 1, pageSize: 20, search: '' })
  await user.type(await screen.findByLabelText('Buscar equipamento para associar'), 'Latitude')
  expect(inventoryState.getInventory).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, search: 'Latitude' })
  await user.click(screen.getByRole('button', { name: 'Carregar mais equipamentos' }))
  expect(inventoryState.getInventory).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, search: 'Latitude' })
})

test('ignores stale equipment search responses that resolve after the current query', async () => {
  let resolveStaleSearch: ((value: Awaited<ReturnType<typeof inventoryState.getInventory>>) => void) | undefined
  inventoryState.getInventory
    .mockResolvedValueOnce({
      items: [{ id: 'eq-initial', patrimony: 'UC-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Sala Administrativa', unitName: 'Unidade Centro' }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    .mockImplementationOnce(() => new Promise((resolve) => { resolveStaleSearch = resolve }))
    .mockResolvedValueOnce({
      items: [{ id: 'eq-latitude', patrimony: 'UC-010', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'active', location: 'Sala 2', unitName: 'Unidade Centro' }],
      total: 1,
      page: 1,
      pageSize: 20,
    })

  renderPage()
  const search = await screen.findByLabelText('Buscar equipamento para associar')
  fireEvent.change(search, { target: { value: 'La' } })
  fireEvent.change(search, { target: { value: 'Latitude' } })

  expect(await screen.findByText('UC-010 · Notebook Dell Latitude')).toBeInTheDocument()

  await act(async () => {
    resolveStaleSearch?.({
      items: [{ id: 'eq-laser', patrimony: 'UC-003', type: 'Impressora', model: 'LaserJet', brand: 'HP', situation: 'maintenance', location: 'Almoxarifado', unitName: 'Unidade Centro' }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
  })

  expect(screen.getByText('UC-010 · Notebook Dell Latitude')).toBeInTheDocument()
  expect(screen.queryByText('UC-003 · Impressora HP LaserJet')).not.toBeInTheDocument()
})

test('shows an accessible error and does not keep invalid attachments', async () => {
  renderPage()
  const invalid = new File(['script'], 'malware.exe', { type: 'application/octet-stream' })

  fireEvent.change(await screen.findByLabelText('Anexos'), { target: { files: [invalid] } })

  expect(screen.getByRole('alert')).toHaveTextContent('Tipo de anexo não permitido')
  expect(screen.queryByText('malware.exe')).not.toBeInTheDocument()
})

test('shows an accessible error and does not keep more than five attachments', async () => {
  renderPage()
  const files = Array.from({ length: 6 }, (_item, index) => new File(['pdf'], `evidencia-${index + 1}.pdf`, { type: 'application/pdf' }))

  fireEvent.change(await screen.findByLabelText('Anexos'), { target: { files } })

  expect(screen.getByRole('alert')).toHaveTextContent('Você pode anexar no máximo 5 arquivos.')
  expect(screen.queryByText('evidencia-1.pdf')).not.toBeInTheDocument()
})

test('presents the attachment selector in the operational interface language', async () => {
  renderPage()

  expect(await screen.findByText('Selecionar arquivos')).toBeInTheDocument()
  expect(screen.getByText('Nenhum arquivo selecionado')).toBeInTheDocument()
})

test('requires review before allowing a call submission and sends selected equipment and attachments', async () => {
  const user = userEvent.setup()
  renderPage()
  await fillRequiredFields(user)
  await user.selectOptions(screen.getByLabelText('Equipamento associado'), 'eq-003')
  const document = new File(['conteúdo'], 'evidencia.pdf', { type: 'application/pdf' })
  await user.upload(screen.getByLabelText('Anexos'), document)

  expect(screen.queryByRole('button', { name: 'Enviar chamado' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Revisar chamado' }))

  expect(screen.getByRole('heading', { name: 'Revise antes de enviar' })).toBeInTheDocument()
  expect(screen.getByText('Suporte')).toBeInTheDocument()
  expect(screen.getByText('UC-003 · Impressora HP LaserJet')).toBeInTheDocument()
  expect(screen.getByText('evidencia.pdf')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Enviar chamado' }))

  expect(await screen.findByRole('status')).toHaveTextContent('CH-2026-900')
  expect(callsState.submitCall).toHaveBeenCalledWith(expect.objectContaining({ problem: 'software', equipmentId: 'eq-003', attachments: [document] }))
})

test('keeps the review visible and displays a recoverable error when submission fails', async () => {
  const user = userEvent.setup()
  callsState.submitCall.mockRejectedValueOnce(new Error('offline'))
  renderPage()
  await fillRequiredFields(user)
  await user.click(screen.getByRole('button', { name: 'Revisar chamado' }))
  await user.click(screen.getByRole('button', { name: 'Enviar chamado' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar o chamado.')
  expect(screen.getByRole('heading', { name: 'Revise antes de enviar' })).toBeInTheDocument()
})
