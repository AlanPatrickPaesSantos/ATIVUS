import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppProviders } from './providers'
import { AppRoutes } from './routes'
import { clearSession } from '../shared/auth/session'
import { server } from '../shared/api/msw/server'

describe('real login route integration', () => {
  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api/v1')
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    clearSession()
    server.resetHandlers()
    vi.restoreAllMocks()
  })

  afterAll(() => {
    server.close()
    vi.unstubAllEnvs()
  })

  function renderLogin() {
    function StatefulRoutes() {
      const [session, setSession] = useState<Parameters<typeof AppRoutes>[0]['session']>(null)

      return <AppRoutes session={session} onSessionChange={setSession} />
    }

    return render(
      <AppProviders>
        <MemoryRouter initialEntries={['/login']}>
          <StatefulRoutes />
        </MemoryRouter>
      </AppProviders>,
    )
  }

  it.each([
    ['DITEL', '200001', 'sigat-ditel', 'Painel estadual'],
    ['Unidade', '100001', 'sigat-unit', 'Painel da Unidade'],
  ])('sends credentials to the API and navigates a valid %s user', async (_label, registration, password, dashboard) => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderLogin()

    await user.type(screen.getByLabelText('Matrícula'), registration)
    await user.type(screen.getByLabelText('Senha'), password)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: dashboard })).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ registration, password }),
      }),
    )
  })

  it('keeps a blocked user on the login screen with the generic error', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Matrícula'), '999998')
    await user.type(screen.getByLabelText('Senha'), 'senha-bloqueada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Entrar no ATIVUS' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível entrar com essas credenciais.')
  })

  it('lands on mandatory password change instead of the dashboard when the session requires it', async () => {
    server.use(http.post('http://localhost/api/v1/auth/login', () => HttpResponse.json({
      userId: 'ditel-001',
      name: 'Carlos Lima',
      registration: '200001',
      role: 'ditel_admin',
      unit: null,
      mustChangePassword: true,
    })))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Matrícula'), '200001')
    await user.type(screen.getByLabelText('Senha'), 'senha-temporaria')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Defina uma nova senha' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Painel estadual' })).not.toBeInTheDocument()
  })
})

