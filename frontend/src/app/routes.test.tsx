import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  vi.stubEnv('VITE_ENABLE_MSW', 'true')
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  queryClient.clear()
  server.use(
    http.get('*/api/v1/movements', () => HttpResponse.json({ items: [apiTransfer] })),
    http.get('*/api/v1/ac/returns', () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 })),
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

const acSession: SessionContext = {
  userId: 'ac-001',
  name: 'Operador AC',
  registration: '400001',
  role: 'ac_operator',
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

test.each([
  ['DITEL', ditelSession, 'Painel estadual'],
  ['unidade', unitSession, 'Painel da Unidade'],
  ['AC', acSession, 'Materiais da AC'],
])('resolves the root route for an authenticated %s session', async (_label, session, heading) => {
  renderRoutes('/', session)

  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
})

test('sends an authenticated AC session away from the login route to AC materials', async () => {
  renderRoutes('/login', acSession)

  expect(await screen.findByRole('heading', { name: 'Materiais da AC' })).toBeInTheDocument()
})

test('keeps the AC materials route after a refresh with a restored session', async () => {
  renderRoutes('/ac/materiais', acSession)

  expect(await screen.findByRole('heading', { name: 'Materiais da AC' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Acesso não autorizado' })).not.toBeInTheDocument()
})

test('preserves an authorized destination through login', async () => {
  const user = userEvent.setup()
  renderRoutes('/inventario', null)

  await user.type(screen.getByLabelText('Matrícula'), '200001')
  await user.type(screen.getByLabelText('Senha'), 'sigat-ditel')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByRole('heading', { name: 'Inventário estadual' })).toBeInTheDocument()
})

test('renders the unit dashboard and allowed navigation for a Unit user', () => {
  renderRoutes('/dashboard', unitSession)
  expect(screen.getByRole('heading', { name: 'Painel da Unidade' })).toBeInTheDocument()
  expect(within(screen.getByRole('main')).getByText('Unidade Centro')).toBeInTheDocument()
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
  expect(await screen.findByText('Falha de conectividade no CIOp')).toBeInTheDocument()
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

  expect(await screen.findByRole('heading', { name: 'Relatórios patrimoniais' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Pré-visualização' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Relatório de garantias' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeEnabled()
  expect(screen.getByText('Filtros aplicados')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Exportar PDF' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Exportação PDF preparada')
})

test('renders supported movement filters without exposing Administration to a Unit user', async () => {
  renderRoutes('/movimentacoes', unitSession)

  expect(await screen.findByRole('heading', { name: 'Histórico de movimentações' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('Transferência entre unidades')).toBeInTheDocument())
  expect(screen.queryByRole('combobox', { name: 'Tipo de movimentação' })).not.toBeInTheDocument()
  expect(screen.queryByText('Baixa patrimonial')).not.toBeInTheDocument()
  expect(screen.queryByText('Alocação interna')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
})

test('blocks direct AC URLs for a unit user', () => {
  renderRoutes('/ac/materiais', unitSession)
  expect(screen.getByRole('heading', { name: 'Acesso não autorizado' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Materiais AC' })).not.toBeInTheDocument()
})

test('blocks direct AC reports URL for a unit user', () => {
  renderRoutes('/ac/relatorios', unitSession)
  expect(screen.getByRole('heading', { name: 'Acesso não autorizado' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Relatórios AC' })).not.toBeInTheDocument()
})

test.each([
  ['100001', 'sigat-unit', 'Painel da Unidade', /3º BPM/i],
  ['200001', 'sigat-ditel', 'Painel estadual', undefined],
  ['400001', 'sigat-ac', 'Materiais da AC', undefined],
])('logs in with API credentials and lands on the expected dashboard', async (registration, password, dashboard, unitSubheading) => {
  const user = userEvent.setup()
  renderRoutes('/login', null)

  await user.type(screen.getByLabelText('Matrícula'), registration)
  await user.type(screen.getByLabelText('Senha'), password)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByRole('heading', { name: dashboard })).toBeInTheDocument()
  if (unitSubheading) expect(within(screen.getByRole('main')).getByText(unitSubheading)).toBeInTheDocument()
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
    '/api/v1/auth/logout',
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  )
})

test('clears the protected destination when another role signs in after logout', async () => {
  const user = userEvent.setup()
  renderRoutes('/missoes-tecnicas', ditelSession)

  await user.click(screen.getByRole('button', { name: 'Carlos Lima' }))
  await user.click(screen.getByRole('menuitem', { name: 'Sair' }))
  await screen.findByRole('heading', { name: 'Entrar no ATIVUS' })

  await user.type(screen.getByLabelText('Matrícula'), '100001')
  await user.type(screen.getByLabelText('Senha'), 'sigat-unit')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByRole('heading', { name: 'Painel da Unidade' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Missões técnicas' })).not.toBeInTheDocument()
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
    '/api/v1/auth/password-change',
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
    '/api/v1/auth/password-change',
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
  server.use(http.post('*/api/v1/auth/password-change', () => HttpResponse.json(
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

