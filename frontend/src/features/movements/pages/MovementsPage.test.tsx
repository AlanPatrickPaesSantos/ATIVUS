import '@testing-library/jest-dom/vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import type { SessionContext } from '../../../shared/auth/types'
import { MovementsPage } from './MovementsPage'

const unitSession: SessionContext = { userId: 'unit-001', name: 'Ana Souza', registration: '100001', role: 'unit_user', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' } }
const ditelSession: SessionContext = { userId: 'ditel-001', name: 'Carlos Lima', registration: '200001', role: 'ditel_admin', unit: null }
const apiTransfer = { id: 'api-mov-01', type: 'Transferência definitiva', equipmentId: 'Rádio APX-2000 · UC-004', origin: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' }, destination: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, requestedBy: 'Carlos Lima', status: 'Aprovada', createdAt: '2026-08-22T14:20:00.000Z', updatedAt: '2026-08-22T14:20:00.000Z' }
const apiEquipment = { id: '507f1f77bcf86cd799439011', patrimony: 'PAT-001', type: 'Rádio', model: 'APX-2000', brand: 'Motorola', situation: 'active', location: 'Sala 1', unitName: 'Unidade Centro' }
const apiUnit = { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }
const emptyAcReturnsResponse = () => new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 100 }), { status: 200 })

beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_MSW', 'true')
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input) => String(input).includes('/ac/returns') ? Promise.resolve(emptyAcReturnsResponse()) : Promise.resolve(new Response(JSON.stringify({ items: [apiTransfer] }), { status: 200 }))))
})

afterEach(() => vi.unstubAllGlobals())

test('keeps Unit movements inside its own scope', async () => {
  render(<MovementsPage session={unitSession} />)

  expect(screen.getByTestId('movements-operation-log')).toHaveAttribute('data-visual-variant', 'operational-movement-log')
  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  expect(screen.queryByText('Alocação interna')).not.toBeInTheDocument()
})

test('lets DITEL consult movements across Units', async () => {
  render(<MovementsPage session={ditelSession} />)

  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  expect(screen.queryByText('Alocação interna')).not.toBeInTheDocument()
  expect(screen.getByText('1 registro')).toBeInTheDocument()
})

test('does not append fixture movements when MSW mock mode is disabled', async () => {
  vi.stubEnv('VITE_ENABLE_MSW', 'false')

  render(<MovementsPage session={ditelSession} />)

  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  expect(screen.queryByText('Alocação interna')).not.toBeInTheDocument()
  expect(screen.getByText('1 registro')).toBeInTheDocument()
})

test('does not expose unsupported allocation or disposal filters', async () => {
  const user = userEvent.setup()
  render(<MovementsPage session={ditelSession} />)
  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())

  expect(screen.queryByRole('button', { name: 'Baixa' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Alocação' })).not.toBeInTheDocument()
  expect(screen.queryByText('Baixa patrimonial')).not.toBeInTheDocument()
  expect(screen.getByText('Transferência')).toBeInTheDocument()
  expect(screen.getByText('1 registro')).toBeInTheDocument()
})

test('filters the operational center by status and unit', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.fn((input) => {
    const url = String(input)
    if (url.includes('/ac/returns')) return Promise.resolve(emptyAcReturnsResponse())
    if (url.includes('status=Pendente')) return Promise.resolve(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 }))
    return Promise.resolve(new Response(JSON.stringify({ items: [apiTransfer], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<MovementsPage session={ditelSession} />)
  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())

  await user.selectOptions(screen.getByLabelText('Situação da movimentação'), 'Pendente')
  await waitFor(() => expect(screen.getByText('Nenhuma movimentação encontrada')).toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements?page=1&pageSize=20&status=Pendente', expect.objectContaining({ credentials: 'include' }))
  await user.selectOptions(screen.getByLabelText('Situação da movimentação'), 'all')
  await user.selectOptions(screen.getByLabelText('Unidade da movimentação'), 'unit-norte')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements?page=1&pageSize=20&unitId=unit-norte', expect.objectContaining({ credentials: 'include' })))
  expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument()
})

test('navigates server pages without changing active filters', async () => {
  const user = userEvent.setup()
  const secondTransfer = { ...apiTransfer, id: 'api-mov-02', equipmentId: 'Rádio APX-3000 · UN-005' }
  const fetchMock = vi.fn((input) => {
    const url = String(input)
    if (url.includes('/ac/returns')) return Promise.resolve(emptyAcReturnsResponse())
    return Promise.resolve(new Response(JSON.stringify(url.includes('page=2') ? { items: [secondTransfer], total: 2, page: 2, pageSize: 1, totalPages: 2 } : { items: [apiTransfer], total: 2, page: 1, pageSize: 1, totalPages: 2 }), { status: 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<MovementsPage session={ditelSession} />)

  await waitFor(() => expect(screen.getByText('Página 1 de 2')).toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Próxima' }))
  await waitFor(() => expect(screen.getByText('Página 2 de 2')).toBeInTheDocument())
  expect(screen.getAllByText('Rádio APX-3000 · UN-005').length).toBeGreaterThan(0)
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements?page=2&pageSize=20', expect.objectContaining({ credentials: 'include' }))
})

test('ignores an older movement response after a filter changes', async () => {
  const user = userEvent.setup()
  const resolvers: Array<(response: Response) => void> = []
  const fetchMock = vi.fn((input) => {
    const url = String(input)
    if (url.includes('/ac/returns')) return Promise.resolve(emptyAcReturnsResponse())
    return new Promise<Response>((resolve) => resolvers.push(resolve))
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<MovementsPage session={ditelSession} />)

  await waitFor(() => expect(resolvers).toHaveLength(1))
  await user.selectOptions(screen.getByLabelText('Situação da movimentação'), 'Pendente')
  await waitFor(() => expect(resolvers).toHaveLength(2))

  resolvers[1](new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 }))
  await waitFor(() => expect(screen.getByText('Nenhuma movimentação encontrada')).toBeInTheDocument())
  resolvers[0](new Response(JSON.stringify({ items: [apiTransfer], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(screen.queryByText('Transferência entre unidades')).not.toBeInTheDocument()
})

test('retries movement loading without leaking unhandled rejections', async () => {
  const user = userEvent.setup()
  const unhandledRejections: unknown[] = []
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    unhandledRejections.push(event.reason)
    event.preventDefault()
  }
  let movementAttempts = 0
  const fetchMock = vi.fn((input) => {
    if (String(input).includes('/ac/returns')) return Promise.resolve(emptyAcReturnsResponse())
    movementAttempts += 1
    return movementAttempts === 1
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(new Response(JSON.stringify({ items: [apiTransfer] }), { status: 200 }))
  })

  window.addEventListener('unhandledrejection', onUnhandledRejection)
  vi.stubGlobal('fetch', fetchMock)

  render(<MovementsPage session={ditelSession} />)

  expect(await screen.findByText('Não foi possível carregar as transferências.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  expect(unhandledRejections).toHaveLength(0)

  window.removeEventListener('unhandledrejection', onUnhandledRejection)
})

test('requires a justification before DITEL rejects a pending movement', async () => {
  const user = userEvent.setup()
  const pending = { ...apiTransfer, id: 'mov-pend-01', status: 'Pendente', updatedAt: '2026-08-30T08:30:00.000Z' }
  let movementReads = 0
  const fetchMock = vi.fn((input) => {
    const url = String(input)
    if (url.includes('/ac/returns')) return Promise.resolve(emptyAcReturnsResponse())
    if (url.endsWith('/decision')) return Promise.resolve(new Response(JSON.stringify({ ...pending, status: 'Rejeitada', decisionReason: 'Documento patrimonial pendente.' }), { status: 200 }))
    movementReads += 1
    return Promise.resolve(new Response(JSON.stringify({ items: [{ ...pending, ...(movementReads > 1 ? { status: 'Rejeitada', decisionReason: 'Documento patrimonial pendente.' } : {}) }] }), { status: 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<MovementsPage session={ditelSession} />)

  await waitFor(() => expect(screen.getByRole('button', { name: /analisar solicitação mov-pend-01/i })).toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: /analisar solicitação mov-pend-01/i }))
  const dialog = screen.getByRole('dialog', { name: 'Analisar movimentação' })
  expect(screen.getByRole('heading', { name: 'Solicitações pendentes' })).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Rejeitar movimentação' }))
  expect(within(dialog).getByText('Informe uma justificativa para rejeitar a solicitação.')).toBeInTheDocument()

  await user.type(within(dialog).getByLabelText('Justificativa da rejeição'), 'Documento patrimonial pendente.')
  await user.click(within(dialog).getByRole('button', { name: 'Rejeitar movimentação' }))

  await waitFor(() => expect(screen.getByText('Rejeitada')).toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/movements/mov-pend-01/decision', expect.objectContaining({ method: 'PATCH' }))
})

test('unit user can review and submit a transfer without client authority fields', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [apiTransfer] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [apiEquipment], total: 1, page: 1, pageSize: 100 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [apiUnit] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...apiTransfer, id: 'new-movement', status: 'Pendente' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [apiTransfer] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<MovementsPage session={unitSession} />)

  await user.click(await screen.findByRole('button', { name: 'Solicitar transferência' }))
  await user.selectOptions(screen.getByLabelText('Equipamento'), apiEquipment.id)
  await user.selectOptions(screen.getByLabelText('Unidade destino'), apiUnit.id)
  await user.click(screen.getByRole('button', { name: 'Revisar solicitação' }))
  expect(screen.getByText('Revisar transferência')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirmar solicitação' }))

  await waitFor(() => expect(screen.getByText(/solicitação foi registrada/i)).toBeInTheDocument())
  const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')
  expect(JSON.parse(postCall?.[1]?.body as string)).toEqual({ equipmentId: apiEquipment.id, destination: apiUnit })
})

test('does not show transfer creation to DITEL', async () => {
  render(<MovementsPage session={ditelSession} />)
  expect(screen.queryByRole('button', { name: 'Solicitar transferência' })).not.toBeInTheDocument()
})
