import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SessionContext } from '../../../shared/auth/types'
import { DitelMissionsPage } from './DitelMissionsPage'

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
    create: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
    update: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
  }
  return { queryState }
})

vi.mock('../api/missionQueries', () => ({
  useMissionsQuery: () => queryState,
  useCreateMission: () => queryState.create,
  useUpdateMission: () => queryState.update,
}))

const ditelSession: SessionContext = { userId: 'ditel-1', name: 'Carlos', registration: '200001', role: 'ditel_admin', unit: { id: 'unit-ditel', name: 'DITEL', acronym: 'DITEL' } }

function renderPage(session: SessionContext = ditelSession) {
  return render(
    <MemoryRouter initialEntries={['/missoes-tecnicas']}>
      <QueryClientProvider client={new QueryClient()}><DitelMissionsPage session={session} /></QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DitelMissionsPage', () => {
  it('lists missions with action buttons for DITEL', async () => {
    renderPage()
    const heading = await screen.findByRole('heading', { name: /missões técnicas/i })
    expect(heading).toBeInTheDocument()
    expect(screen.getByText('Instalar rádio')).toBeInTheDocument()
    expect(screen.getByText('Atribuída')).toBeInTheDocument()
  })

  it('cancels an assigned mission', async () => {
    const user = userEvent.setup()
    queryState.update.mutateAsync.mockResolvedValueOnce(undefined)
    vi.spyOn(window, 'prompt').mockReturnValue('Motivo do cancelamento')
    renderPage()
    const row = (await screen.findByText('Instalar rádio')).closest('[role="row"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Cancelar' }))
    expect(queryState.update.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'mis-001', input: expect.objectContaining({ status: 'cancelled' }) }))
  })

  it('opens creation modal and submits', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: /missões técnicas/i })
    await user.click(screen.getByRole('button', { name: /nova missão/i }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/título/i), 'Manutenção preventiva')
    await user.type(within(dialog).getByLabelText(/descrição/i), 'Revisão de rádio')
    await user.click(within(dialog).getByRole('button', { name: /criar missão/i }))
    expect(queryState.create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Manutenção preventiva', description: 'Revisão de rádio' }),
    )
  })
})
