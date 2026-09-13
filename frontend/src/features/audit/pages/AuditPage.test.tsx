import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SessionContext } from '../../../shared/auth/types'
import { AuditPage } from './AuditPage'

const { queryState } = vi.hoisted(() => {
  const queryState = {
    data: {
      items: [
        { id: 'aud-001', action: 'maintenance.update', module: 'maintenance', userId: 'ditel-1', result: 'success' as const,
          actor: { id: 'ditel-1', name: 'Carlos Lima', registration: '200001' },
          entity: { type: 'maintenance', id: 'mnt-001', label: 'Manutenção #1' },
          unit: { id: 'unit-centro', name: '3º BPM' }, reason: null,
          before: { status: 'open' }, after: { status: 'completed', diagnosis: 'Falha no módulo', service: 'Substituição' },
          retentionExpiresAt: null, createdAt: '2026-09-12T15:30:00.000Z', updatedAt: '2026-09-12T15:30:00.000Z' },
        { id: 'aud-002', action: 'login.failure', module: 'auth', userId: 'unit-2', result: 'failure' as const,
          actor: { id: 'unit-2', name: 'Bruno Lima', registration: '3456789' },
          entity: null, unit: { id: 'unit-norte', name: 'Unidade Norte' },
          reason: 'Senha inválida', before: null, after: null,
          retentionExpiresAt: null, createdAt: '2026-09-12T08:05:00.000Z', updatedAt: '2026-09-12T08:05:00.000Z' },
      ],
      total: 2, page: 1, pageSize: 20,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
  return { queryState }
})

vi.mock('../api/auditQueries', () => ({
  useAuditEventsQuery: () => queryState,
}))

const ditelSession: SessionContext = { userId: 'ditel-1', name: 'Carlos', registration: '200001', role: 'ditel_admin', unit: { id: 'unit-ditel', name: 'DITEL', acronym: 'DITEL' } }

function renderPage(session: SessionContext = ditelSession) {
  return render(
    <MemoryRouter initialEntries={['/auditoria']}>
      <QueryClientProvider client={new QueryClient()}><AuditPage session={session} /></QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('AuditPage', () => {
  it('lists audit events', async () => {
    renderPage()
    expect(await screen.findByText('Atualização de manutenção')).toBeInTheDocument()
    expect(screen.getByText('Login falho')).toBeInTheDocument()
    expect(screen.getByText('Carlos Lima')).toBeInTheDocument()
    expect(screen.getByText(/2 eventos/)).toBeInTheDocument()
  })

  it('opens event details with before/after', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Atualização de manutenção'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Falha no módulo/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Substituição/)).toBeInTheDocument()
  })

  it('filters by result failure', async () => {
    const user = userEvent.setup()
    renderPage()
    const resultSelect = screen.getByLabelText(/filtrar por resultado/i)
    await user.selectOptions(resultSelect, 'failure')
    await user.click(screen.getByRole('button', { name: /aplicar filtros/i }))
    expect(resultSelect).toHaveValue('failure')
  })
})