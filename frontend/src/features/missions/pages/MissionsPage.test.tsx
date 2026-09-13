import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SessionContext } from '../../../shared/auth/types'
import { MissionsPage } from './MissionsPage'

const { queryState } = vi.hoisted(() => {
  const queryState = {
    data: { items: [
      { id: 'mis-001', title: 'Instalar rádio', description: 'Sala de comunicações', type: 'installation', status: 'assigned', priority: 'high',
        unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' },
        equipment: [{ id: 'eq-001', patrimony: 'PAT-001', type: 'Rádio', model: 'APX', brand: 'Motorola' }],
        assignedBy: { id: 'ditel-1', name: 'Carlos', registration: '200001' },
        assignedTo: { id: 'unit-centro', name: '3º BPM', registration: '100001' },
        startedAt: null, completedAt: null, notes: [], createdAt: '2026-09-10T09:00:00Z', updatedAt: '2026-09-10T09:00:00Z',
      },
    ] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    update: { mutateAsync: vi.fn(), isPending: false },
  }
  return { queryState }
})

vi.mock('../api/missionQueries', () => ({
  useMissionsQuery: () => queryState,
  useUpdateMission: () => queryState.update,
}))

const unitSession: SessionContext = { userId: 'unit-1', name: 'Ana', registration: '100001', role: 'unit_user', unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' } }

function renderPage(session: SessionContext = unitSession) {
  return render(
    <MemoryRouter initialEntries={['/missoes-tecnicas']}>
      <QueryClientProvider client={new QueryClient()}><MissionsPage session={session} /></QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('MissionsPage', () => {
  it('lists missions with correct status', async () => {
    renderPage()
    expect(await screen.findByText('Instalar rádio')).toBeInTheDocument()
    const row = screen.getByText('Instalar rádio').closest('tr') ?? screen.getByText('Instalar rádio').closest('div')
    expect(row).toBeDefined()
    expect(within(row!).getByText('Atribuída')).toBeInTheDocument()
  })

  it('starts an assigned mission', async () => {
    const user = userEvent.setup()
    queryState.update.mutateAsync.mockResolvedValueOnce(undefined)
    renderPage()
    await user.click(await screen.findByText('Instalar rádio'))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /iniciar missão/i }))
    expect(queryState.update.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'mis-001', input: expect.objectContaining({ status: 'in_progress' }) }))
  })

  it('completes an in-progress mission', async () => {
    const user = userEvent.setup()
    queryState.data.items[0] = { ...queryState.data.items[0], status: 'in_progress' }
    queryState.update.mutateAsync.mockResolvedValueOnce(undefined)
    renderPage()
    const row = await screen.findByText('Instalar rádio')
    await user.click(row)
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /concluir missão/i }))
    expect(queryState.update.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'mis-001', input: expect.objectContaining({ status: 'completed' }) }))
  })
})