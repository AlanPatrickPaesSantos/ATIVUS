import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { AppProviders, queryClient } from './providers'
import type { SessionContext } from '../shared/auth/types'
import { clearSession, createSession, setSession as setStoredSession } from '../shared/auth/session'
import { server } from '../shared/api/msw/server'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'

const apiTransfer = { id: 'api-mov-01', type: 'Transferência definitiva', equipmentId: 'Rádio APX-2000 · UC-004', origin: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' }, destination: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, requestedBy: 'Carlos Lima', status: 'Aprovada', createdAt: '2026-08-22T14:20:00.000Z', updatedAt: '2026-08-22T14:20:00.000Z' }

beforeAll(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api/v1')
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  queryClient.clear()
  server.use(
    http.get('*/api/v1/movements', () => HttpResponse.json({ items: [apiTransfer] })),
  )
})
afterEach(() => {
  clearSession()
  queryClient.clear()
  server.resetHandlers()
  vi.unstubAllGlobals()
})
afterAll(() => {
  server.close()
  queryClient.clear()
  vi.unstubAllEnvs()
})

const unitSession: SessionContext = {
  userId: 'unit-001',
  name: 'Ana Souza',
  registration: '100001',
  role: 'unit_user',
  unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'UC' },
}

const ditelSession: SessionContext = {
  userId: 'ditel-001',
  name: 'Carlos Lima',
  registration: '200001',
  role: 'ditel_admin',
  unit: null,
}

const mustChangePasswordSession: SessionContext = {
  ...ditelSession,
  mustChangePassword: true,
}

function StatefulRoutes({ path, initialSession = null }: { path: string; initialSession?: SessionContext | null }) {
  const [session, setSession] = useState<SessionContext | null>(initialSession)

  return <AppProviders><MemoryRouter initialEntries={[path]}><AppRoutes session={session} onSessionChange={setSession} /></MemoryRouter></AppProviders>
}

function renderRoutes(path: string, session: SessionContext | null) {
  setStoredSession(session)
  return render(
    <StatefulRoutes path={path} initialSession={session} />,
  )
}

test('renders the public login route', () => {
  renderRoutes('/login', null)
  expect(screen.getByRole('heading', { name: 'Entrar no ATIVUS' })).toBeInTheDocument()
})

test('redirects unauthenticated dashboard access to login', () => {
  renderRoutes('/dashboard', null)
  expect(screen.getByRole('heading', { name: 'Entrar no ATIVUS' })).toBeInTheDocument()
})

test('renders the unit dashboard and allowed navigation for a Unit user', () => {
  renderRoutes('/dashboard', unitSession)
  expect(screen.getByRole('heading', { name: 'Painel da Unidade' })).toBeInTheDocument()
  expect(screen.getByText(/Unidade Centro · visão atualizada/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Inventário' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
})

test('navigates to the real Unit inventory page through the module link', async () => {
  const user = userEvent.setup()
  renderRoutes('/dashboard', unitSession)

  await user.click(screen.getByRole('link', { name: 'Inventário' }))

  expect(await screen.findByRole('heading', { name: 'Inventário da Unidade Centro' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Entrar no ATIVUS' })).not.toBeInTheDocument()
})

test('renders the real inventory page in the authenticated Unit scope', () => {
  renderRoutes('/inventario', unitSession)

  expect(screen.getByRole('heading', { name: 'Inventário da Unidade Centro' })).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Buscar equipamento' })).toBeInTheDocument()
  expect(screen.queryByTestId('protected-module-data')).not.toBeInTheDocument()
})

test('renders statewide inventory and calls consultation for DITEL', async () => {
  await createSession({ signIn: async () => ditelSession }, '', '')
  renderRoutes('/inventario', ditelSession)
  expect(screen.getByRole('heading', { name: 'Inventário estadual' })).toBeInTheDocument()

  renderRoutes('/chamados', ditelSession)
  expect(await screen.findByRole('heading', { name: 'Chamados estaduais' })).toBeInTheDocument()
  expect(screen.getByText('Falha de conectividade no CIOp')).toBeInTheDocument()
})

test('renders the statewide dashboard and Administration for a DITEL user', async () => {
  renderRoutes('/dashboard', ditelSession)
  expect(screen.getByRole('heading', { name: 'Painel estadual' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Unidades monitoradas' })).toBeInTheDocument()
  expect(screen.getByText('Administração patrimonial')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Administração' })).toBeInTheDocument()
})

test('loads the authenticated reports preview and exports PDF through the API', async () => {
  const user = userEvent.setup()
  renderRoutes('/relatorios', ditelSession)

  expect(screen.getByRole('heading', { name: 'Relatórios patrimoniais' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Pré-visualização' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Relatório de garantias' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeEnabled()
  expect(screen.getByText('Filtros aplicados')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Exportar PDF' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Exportação PDF preparada')
})

test('renders a filterable movement history without exposing Administration to a Unit user', async () => {
  const user = userEvent.setup()
  renderRoutes('/movimentacoes', unitSession)

  expect(screen.getByRole('heading', { name: 'Histórico de movimentações' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de movimentação' }), 'baixa')
  expect(screen.getByText('Baixa patrimonial')).toBeInTheDocument()
  expect(screen.queryByText('Transferência entre unidades')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
})

test.each([
  ['100001', 'sigat-unit', 'Painel da Unidade', /3º BPM · visão atualizada/i],
  ['200001', 'sigat-ditel', 'Painel estadual', undefined],
])('logs in with API credentials and lands on the expected dashboard', async (registration, password, dashboard, unitSubheading) => {
  const user = userEvent.setup()
  renderRoutes('/login', null)

  await user.type(screen.getByLabelText('Matrícula'), registration)
  await user.type(screen.getByLabelText('Senha'), password)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByRole('heading', { name: dashboard })).toBeInTheDocument()
  if (unitSubheading) expect(screen.getByText(unitSubheading)).toBeInTheDocument()
})

test('shows a permission state for unauthorized direct navigation', () => {
  renderRoutes('/administracao', unitSession)

  expect(screen.getByRole('heading', { name: 'Acesso não autorizado' })).toBeInTheDocument()
  expect(screen.queryByTestId('protected-module-data')).not.toBeInTheDocument()
})

test('revokes the server session before returning to the login route', async () => {
  const user = userEvent.setup()
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  renderRoutes('/dashboard', ditelSession)

  await user.click(screen.getByRole('button', { name: 'Carlos Lima' }))
  await user.click(screen.getByRole('menuitem', { name: 'Sair' }))

  expect(await screen.findByRole('heading', { name: 'Entrar no ATIVUS' })).toBeInTheDocument()
  expect(fetchSpy).toHaveBeenCalledWith(
    'http://localhost/api/v1/auth/logout',
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  )
})

test('blocks protected modules while a mandatory password change is pending', () => {
  renderRoutes('/dashboard', mustChangePasswordSession)

  expect(screen.getByRole('heading', { name: 'Defina uma nova senha' })).toBeInTheDocument()
  expect(screen.getByText(/troca obrigatória/i)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Painel estadual' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
})

test('validates mandatory password confirmation locally without calling the API', async () => {
  const user = userEvent.setup()
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  renderRoutes('/dashboard', mustChangePasswordSession)

  await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-segura')
  await user.type(screen.getByLabelText('Confirmar nova senha'), 'senha-diferente')
  await user.click(screen.getByRole('button', { name: 'Atualizar senha' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não conferem.')
  expect(fetchSpy).not.toHaveBeenCalledWith(
    'http://localhost/api/v1/auth/password-change',
    expect.anything(),
  )
})

test('submits mandatory password change, updates the session, and releases the app', async () => {
  const user = userEvent.setup()
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  renderRoutes('/dashboard', mustChangePasswordSession)

  await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-segura')
  await user.type(screen.getByLabelText('Confirmar nova senha'), 'nova-senha-segura')
  await user.click(screen.getByRole('button', { name: 'Atualizar senha' }))

  expect(await screen.findByRole('heading', { name: 'Painel estadual' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Defina uma nova senha' })).not.toBeInTheDocument()
  expect(fetchSpy).toHaveBeenCalledWith(
    'http://localhost/api/v1/auth/password-change',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ newPassword: 'nova-senha-segura' }),
    }),
  )
  expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain('confirmPassword')
  expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain('passwordHash')
})

test('keeps the mandatory password form available after an API failure', async () => {
  server.use(http.post('http://localhost/api/v1/auth/password-change', () => HttpResponse.json(
    { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    { status: 500 },
  )))
  const user = userEvent.setup()
  renderRoutes('/dashboard', mustChangePasswordSession)

  await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-segura')
  await user.type(screen.getByLabelText('Confirmar nova senha'), 'nova-senha-segura')
  await user.click(screen.getByRole('button', { name: 'Atualizar senha' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar a senha. Tente novamente.')
  expect(screen.getByRole('button', { name: 'Atualizar senha' })).toBeEnabled()
})

