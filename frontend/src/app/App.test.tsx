import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { App } from './App'
import { resetMockAuth, setMockAuthState } from '../shared/api/msw/handlers'
import { server } from '../shared/api/msw/server'
import { clearSession, createSession } from '../shared/auth/session'
import { fixtureSessionAdapter } from '../features/auth/data/sessionFixture'

test('renders the SIGAT application shell', () => {
  render(<App />)
  expect(screen.getByText('SIGAT')).toBeInTheDocument()
})

beforeAll(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api/v1')
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  clearSession()
  resetMockAuth()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
  vi.unstubAllEnvs()
})

test('restores an authenticated session before rendering protected content', async () => {
  server.use(http.get('http://localhost/api/v1/session', () => HttpResponse.json({
    userId: 'ditel-001',
    name: 'Carlos Lima',
    registration: '200001',
    role: 'ditel_admin',
    unit: null,
  })))

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Painel estadual DITEL' })).toBeInTheDocument()
})

test('keeps the loading state until the session endpoint validates the cookie', async () => {
  let resolveSession: ((response: Response) => void) | undefined
  server.use(http.get('http://localhost/api/v1/session', () => new Promise((resolve) => {
    resolveSession = resolve
  })))

  render(<App />)

  expect(screen.getByText('Carregando sessão…')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Entrar no SIGAT' })).not.toBeInTheDocument()
  await waitFor(() => expect(resolveSession).toEqual(expect.any(Function)))

  resolveSession!(HttpResponse.json({
    userId: 'ditel-001',
    name: 'Carlos Lima',
    registration: '200001',
    role: 'ditel_admin',
    unit: null,
  }))

  expect(await screen.findByRole('heading', { name: 'Painel estadual DITEL' })).toBeInTheDocument()
})

test('ignores a cached context when the session cookie is absent', async () => {
  setMockAuthState('absent')
  await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Entrar no SIGAT' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Painel estadual DITEL' })).not.toBeInTheDocument()
})

test('redirects to login when the session belongs to a blocked user', async () => {
  setMockAuthState('blocked')

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Entrar no SIGAT' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Painel estadual DITEL' })).not.toBeInTheDocument()
})

test('rehydrates a valid session after reload from the session cookie', async () => {
  const user = userEvent.setup()
  const firstRender = render(<App />)

  await user.type(await screen.findByLabelText('Matrícula'), '200001')
  await user.type(screen.getByLabelText('Senha'), 'sigat-ditel')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('heading', { name: 'Painel estadual DITEL' })).toBeInTheDocument()

  firstRender.unmount()
  clearSession()
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Painel estadual DITEL' })).toBeInTheDocument()
})
