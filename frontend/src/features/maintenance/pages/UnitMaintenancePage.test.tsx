import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { AppProviders } from '../../../app/providers'
import { UnitMaintenancePage } from './UnitMaintenancePage'
import type { MaintenanceItem } from '../api/maintenanceApi'
import type { SessionContext } from '../../../shared/auth/types'

const maintenanceApiState = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../api/maintenanceApi', () => ({
  getMaintenance: maintenanceApiState.list,
  createMaintenance: maintenanceApiState.create,
  updateMaintenance: maintenanceApiState.update,
}))

const inventoryApiState = vi.hoisted(() => ({
  getInventory: vi.fn(async () => ({
    items: [
      { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', situation: 'active', location: 'Sala', unitName: 'Unidade Centro' },
      { id: 'eq-002', patrimony: 'PAT-2026-004822', type: 'Notebook', model: 'Latitude', brand: 'Dell', situation: 'maintenance', location: 'Suporte', unitName: 'Unidade Centro' },
    ],
    total: 2, page: 1, pageSize: 100,
  })),
}))

vi.mock('../../inventory/api/inventoryApi', () => ({
  getInventory: inventoryApiState.getInventory,
  getEquipmentDetails: vi.fn(),
}))

const queryState = vi.hoisted(() => {
  const state = {
    result: {
      data: { items: [] as MaintenanceItem[] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    create: { mutateAsync: vi.fn(), isPending: false, isError: false, error: null as Error | null, reset: vi.fn() },
    update: { mutateAsync: vi.fn(), isPending: false, isError: false, error: null as Error | null, reset: vi.fn() },
  }
  state.create.mutateAsync.mockImplementation(() => {
    state.create.isError = true
    return Promise.reject(new Error('offline'))
  })
  return state
})

vi.mock('../api/maintenanceQueries', () => ({
  useMaintenanceQuery: () => queryState.result,
  useCreateMaintenance: () => queryState.create,
  useUpdateMaintenance: () => queryState.update,
}))

const unitSession: SessionContext = {
  userId: 'unit-001',
  name: 'Ana Souza',
  registration: '100001',
  role: 'unit_user',
  unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' },
}

const historyFixture: MaintenanceItem[] = [
  {
    id: 'mnt-001', equipment: { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' },
    unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' }, status: 'open', type: 'corrective',
    description: 'Rádio sem transmissão.', openedAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: 'mnt-002', equipment: { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' },
    unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' }, status: 'completed', type: 'corrective',
    description: 'Substituição do módulo.', diagnosis: 'Falha no módulo de transmissão', service: 'Substituição do módulo', completedAt: '2026-09-10T12:00:00.000Z',
    openedAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-10T12:00:00.000Z',
  },
]

function renderPage() {
  return render(<MemoryRouter><AppProviders><UnitMaintenancePage session={unitSession} /></AppProviders></MemoryRouter>)
}

afterEach(() => {
  vi.clearAllMocks()
  queryState.result.data = { items: [] }
  queryState.result.isLoading = false
  queryState.result.isError = false
  queryState.result.refetch = vi.fn()
  queryState.create.mutateAsync.mockReset()
  queryState.create.mutateAsync.mockImplementation(() => {
    queryState.create.isError = true
    return Promise.reject(new Error('offline'))
  })
  queryState.create.isPending = false
  queryState.create.isError = false
  queryState.create.error = null
  queryState.create.reset.mockReset()
  queryState.update.mutateAsync.mockReset()
  queryState.update.isPending = false
  queryState.update.isError = false
  queryState.update.error = null
  queryState.update.reset.mockReset()
  inventoryApiState.getInventory.mockClear()
})

test('lists maintenance records of the unit and shows situation/type', async () => {
  queryState.result.data = { items: historyFixture }
  renderPage()

  expect(await screen.findByText('Manutenção da Unidade')).toBeInTheDocument()
  expect(screen.getByText('Rádio sem transmissão.')).toBeInTheDocument()
  expect(screen.getByText('Substituição do módulo.')).toBeInTheDocument()
  const rows = screen.getAllByRole('row')
  expect(within(rows[1]).getByText('Aberta')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Concluída')).toBeInTheDocument()
})

test('retries loading maintenance records after a failure', async () => {
  const user = userEvent.setup()
  queryState.result.isError = true
  queryState.result.refetch = vi.fn()
  renderPage()

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar')
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  expect(queryState.result.refetch).toHaveBeenCalledOnce()
})

test('opens a maintenance request for a unit equipment and shows the confirmation with loading, without double submit', async () => {
  const user = userEvent.setup()
  queryState.result.data = { items: [] }
  const successSpy = vi.spyOn(queryState.create, 'mutateAsync').mockResolvedValueOnce(undefined)
  renderPage()

  await user.click(await screen.findByRole('button', { name: /abrir manutenção/i }))
  const dialog = screen.getByRole('dialog', { name: 'Abrir manutenção' })
  await user.selectOptions(within(dialog).getByLabelText('Equipamento'), 'eq-001')
  await user.selectOptions(within(dialog).getByLabelText('Tipo de manutenção'), 'corrective')
  await user.type(within(dialog).getByLabelText('Descrição do problema'), 'Rádio sem transmissão.')
  await user.click(within(dialog).getByRole('button', { name: 'Revisar manutenção' }))

  expect(screen.getByText('PAT-2026-004821 · Rádio portátil Motorola APX 2000')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar abertura' }))

  expect(successSpy).toHaveBeenCalledOnce()
  expect(successSpy).toHaveBeenCalledWith(expect.objectContaining({ equipmentId: 'eq-001', status: 'open', type: 'corrective', description: 'Rádio sem transmissão.' }))
  expect(await screen.findByText(/manutenção aberta com sucesso/i)).toBeInTheDocument()
})

test('offers retry and does not double-submit when the create request fails', async () => {
  const user = userEvent.setup()
  queryState.result.data = { items: [] }
  queryState.create.mutateAsync.mockRejectedValueOnce(new Error('offline'))
  renderPage()

  await user.click(await screen.findByRole('button', { name: /abrir manutenção/i }))
  const dialog = screen.getByRole('dialog', { name: 'Abrir manutenção' })
  await user.selectOptions(within(dialog).getByLabelText('Equipamento'), 'eq-001')
  await user.selectOptions(within(dialog).getByLabelText('Tipo de manutenção'), 'corrective')
  await user.type(within(dialog).getByLabelText('Descrição do problema'), 'Problema persistente.')
  await user.click(within(dialog).getByRole('button', { name: 'Revisar manutenção' }))
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar abertura' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/não foi possível/i)
  await user.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))
  expect(queryState.create.mutateAsync).toHaveBeenCalledTimes(2)
})