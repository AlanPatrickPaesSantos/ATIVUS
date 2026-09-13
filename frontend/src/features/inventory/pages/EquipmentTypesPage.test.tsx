import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../../app/providers'
import type { SessionContext } from '../../../shared/auth/types'
import { EquipmentTypesPage } from './EquipmentTypesPage'

const session: SessionContext = { userId: 'ditel-1', name: 'DITEL Admin', registration: '200001', role: 'ditel_admin', unit: null }

const { queryState, mutationState } = vi.hoisted(() => {
  const queryState: { data: { items: Array<{ id: string; name: string; description: string; active: boolean; createdAt: string; updatedAt: string }> }; isLoading: boolean; isError: boolean; refetch: ReturnType<typeof vi.fn> } = { data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() }
  const mutationState = { create: { mutateAsync: vi.fn(), isPending: false }, update: { mutateAsync: vi.fn(), isPending: false }, deactivate: { mutateAsync: vi.fn(), isPending: false } }
  return { queryState, mutationState }
})

vi.mock('../api/equipmentTypeQueries', () => ({
  useEquipmentTypesQuery: vi.fn(() => queryState),
  useCreateEquipmentType: vi.fn(() => mutationState.create),
  useUpdateEquipmentType: vi.fn(() => mutationState.update),
  useDeactivateEquipmentType: vi.fn(() => mutationState.deactivate),
}))

describe('EquipmentTypesPage (DITEL)', () => {
  it('lists equipment types with situation and actions', () => {
    queryState.data = {
      items: [
        { id: 'et-001', name: 'Rádio portátil', description: 'Comunicação tática', active: true, createdAt: '2026-01-05T09:00:00.000Z', updatedAt: '2026-01-05T09:00:00.000Z' },
        { id: 'et-002', name: 'Notebook', description: '', active: false, createdAt: '2026-01-05T09:05:00.000Z', updatedAt: '2026-01-05T09:05:00.000Z' },
      ],
    }
    render(<MemoryRouter><AppProviders><EquipmentTypesPage session={session} /></AppProviders></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Tipos de equipamento' })).toBeTruthy()
    expect(screen.getByText('Rádio portátil')).toBeTruthy()
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('Inativo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /desativar/i })).toBeTruthy()
  })

  it('shows loading state', () => {
    queryState.isLoading = true
    queryState.isError = false
    render(<MemoryRouter><AppProviders><EquipmentTypesPage session={session} /></AppProviders></MemoryRouter>)
    expect(screen.getByText(/carregando/i)).toBeTruthy()
    queryState.isLoading = false
  })

  it('shows error state and retries', async () => {
    const user = userEvent.setup()
    queryState.isLoading = false
    queryState.isError = true
    render(<MemoryRouter><AppProviders><EquipmentTypesPage session={session} /></AppProviders></MemoryRouter>)
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(queryState.refetch).toHaveBeenCalled()
    queryState.isError = false
  })

  it('creates a new type', async () => {
    const user = userEvent.setup()
    queryState.data = { items: [] }
    queryState.isError = false
    mutationState.create.mutateAsync.mockResolvedValueOnce({ id: 'et-new', name: 'Drone', description: '', active: true, createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z' })
    render(<MemoryRouter><AppProviders><EquipmentTypesPage session={session} /></AppProviders></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '+ Novo tipo' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Nome do tipo'), 'Drone')
    await user.type(within(dialog).getByLabelText('Descrição do tipo'), 'Aeronave remotamente pilotada')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar tipo' }))
    expect(mutationState.create.mutateAsync).toHaveBeenCalledWith({ name: 'Drone', description: 'Aeronave remotamente pilotada' })
  })

  it('deactivates a type after confirmation', async () => {
    const user = userEvent.setup()
    queryState.data = {
      items: [{ id: 'et-001', name: 'Rádio portátil', description: 'Comunicação tática', active: true, createdAt: '2026-01-05T09:00:00.000Z', updatedAt: '2026-01-05T09:00:00.000Z' }],
    }
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mutationState.deactivate.mutateAsync.mockResolvedValueOnce(undefined)
    render(<MemoryRouter><AppProviders><EquipmentTypesPage session={session} /></AppProviders></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: /desativar/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(mutationState.deactivate.mutateAsync).toHaveBeenCalledWith('et-001')
    confirmSpy.mockRestore()
  })
})