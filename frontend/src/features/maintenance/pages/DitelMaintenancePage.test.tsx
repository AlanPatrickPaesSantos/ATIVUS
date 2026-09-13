import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { AppProviders } from '../../../app/providers'
import { DitelMaintenancePage } from './DitelMaintenancePage'
import type { MaintenanceItem } from '../api/maintenanceApi'

const maintenanceApiState = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), create: vi.fn() }))
vi.mock('../api/maintenanceApi', () => ({
  getMaintenance: maintenanceApiState.list,
  createMaintenance: maintenanceApiState.create,
  updateMaintenance: maintenanceApiState.update,
}))

const queryState = vi.hoisted(() => ({
  result: { data: { items: [] as MaintenanceItem[] }, isLoading: false, isError: false, refetch: vi.fn() },
  update: { mutateAsync: vi.fn(), isPending: false, isError: false, error: null as Error | null, reset: vi.fn() },
}))

vi.mock('../api/maintenanceQueries', () => ({
  useMaintenanceQuery: () => queryState.result,
  useCreateMaintenance: () => vi.fn(),
  useUpdateMaintenance: () => queryState.update,
}))

const ditelSession = {
  userId: 'ditel-001', name: 'Carlos Lima', registration: '200001', role: 'ditel_admin' as const, unit: null,
}

const openItem: MaintenanceItem = {
  id: 'mnt-001', equipment: { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' },
  unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' }, status: 'open', type: 'corrective',
  description: 'Rádio sem transmissão.', openedAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z',
}

function renderPage() {
  return render(<MemoryRouter><AppProviders><DitelMaintenancePage session={ditelSession} /></AppProviders></MemoryRouter>)
}

afterEach(() => { vi.clearAllMocks(); queryState.result.data = { items: [] }; queryState.result.isLoading = false; queryState.result.isError = false; queryState.result.refetch = vi.fn(); queryState.update.mutateAsync.mockReset(); queryState.update.isPending = false; queryState.update.isError = false; queryState.update.error = null; queryState.update.reset.mockReset() })

test('lists all maintenance records for DITEL and confirms completion with diagnosis and service', async () => {
  const user = userEvent.setup()
  queryState.result.data = { items: [openItem] }
  const updated: MaintenanceItem = { ...openItem, status: 'completed', diagnosis: 'Falha no módulo', service: 'Substituição', technicalResponsible: 'Equipe DITEL', completedAt: '2026-09-13T12:00:00.000Z', updatedAt: '2026-09-13T12:00:00.000Z' }
  queryState.update.mutateAsync.mockResolvedValueOnce(updated)
  renderPage()

  expect(await screen.findByText('Rádio sem transmissão.')).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: /atualizar/i }))

  const dialog = screen.getByRole('dialog', { name: /atualizar manutenção/i })
  await user.selectOptions(within(dialog).getByLabelText('Situação'), 'completed')
  await user.type(within(dialog).getByLabelText('Diagnóstico'), 'Falha no módulo')
  await user.type(within(dialog).getByLabelText('Serviço realizado'), 'Substituição')
  await user.type(within(dialog).getByLabelText('Responsável técnico'), 'Equipe DITEL')
  await user.click(within(dialog).getByRole('button', { name: 'Revisar atualização' }))
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar atualização' }))

    expect(queryState.update.mutateAsync).toHaveBeenCalledWith({ maintenanceId: 'mnt-001', input: expect.objectContaining({ status: 'completed', diagnosis: 'Falha no módulo', service: 'Substituição', technicalResponsible: 'Equipe DITEL' }) })
})

test('shows conflict recovery when the maintenance was updated elsewhere (409)', async () => {
  const user = userEvent.setup()
  queryState.result.data = { items: [openItem] }
  const updated: MaintenanceItem = { ...openItem, status: 'completed', updatedAt: '2026-09-13T12:00:00.000Z' }
  queryState.update.mutateAsync
    .mockRejectedValueOnce(Object.assign(new Error('MAINTENANCE_CONFLICT: alterada por outra operação.'), { code: 'MAINTENANCE_CONFLICT' }))
    .mockResolvedValueOnce(updated)
  renderPage()

  await user.click(await screen.findByRole('button', { name: /atualizar/i }))
  const dialog = screen.getByRole('dialog', { name: /atualizar manutenção/i })
  await user.selectOptions(within(dialog).getByLabelText('Situação'), 'completed')
  await user.click(within(dialog).getByRole('button', { name: 'Revisar atualização' }))
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar atualização' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/alterada por outra operação/i)
  expect(within(dialog).getByRole('button', { name: /recarregar dados atuais/i })).toBeInTheDocument()
})