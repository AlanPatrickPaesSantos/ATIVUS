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

beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_MSW', 'true')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [apiTransfer] }), { status: 200 })))
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
  expect(screen.getByText('Alocação interna')).toBeInTheDocument()
  expect(screen.getByText('3 registros')).toBeInTheDocument()
})

test('does not append fixture movements when MSW mock mode is disabled', async () => {
  vi.stubEnv('VITE_ENABLE_MSW', 'false')

  render(<MovementsPage session={ditelSession} />)

  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  expect(screen.queryByText('Alocação interna')).not.toBeInTheDocument()
  expect(screen.getByText('1 registro')).toBeInTheDocument()
})

test('filters the movement log through quick type controls', async () => {
  const user = userEvent.setup()
  render(<MovementsPage session={ditelSession} />)
  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())

  await user.click(screen.getByRole('button', { name: 'Baixa' }))

  expect(screen.getByText('Baixa patrimonial')).toBeInTheDocument()
  expect(screen.queryByText('Transferência entre unidades')).not.toBeInTheDocument()
  expect(screen.getByText('1 registro')).toBeInTheDocument()
})

test('retries movement loading without leaking unhandled rejections', async () => {
  const user = userEvent.setup()
  const unhandledRejections: unknown[] = []
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    unhandledRejections.push(event.reason)
    event.preventDefault()
  }
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [apiTransfer] }), { status: 200 }))

  window.addEventListener('unhandledrejection', onUnhandledRejection)
  vi.stubGlobal('fetch', fetchMock)

  render(<MovementsPage session={ditelSession} />)

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as transferências.')
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  expect(unhandledRejections).toHaveLength(0)

  window.removeEventListener('unhandledrejection', onUnhandledRejection)
})

test('requires a justification before DITEL rejects a pending movement', async () => {
  const user = userEvent.setup()
  const pending = { ...apiTransfer, id: 'mov-pend-01', status: 'Pendente', updatedAt: '2026-08-30T08:30:00.000Z' }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [pending] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...pending, status: 'Rejeitada', decisionReason: 'Documento patrimonial pendente.' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...pending, status: 'Rejeitada', decisionReason: 'Documento patrimonial pendente.' }] }), { status: 200 }))
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
