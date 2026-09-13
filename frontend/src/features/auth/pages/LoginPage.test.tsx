import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './LoginPage'
import { fixtureSessionAdapter } from '../data/sessionFixture'

test('renders the PMPA and DITEL institutional sign-in form', () => {
  render(<LoginPage onLogin={async () => null} />)

  expect(screen.getByTestId('login-split-screen')).toHaveAttribute('data-visual-variant', 'institutional-night-frame')
  expect(screen.getByTestId('login-card')).toHaveAttribute('data-visual-variant', 'centered-institutional-credential')
  expect(screen.getByRole('heading', { name: 'Entrar no SIGAT' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Brasão da Polícia Militar do Pará' })).toBeInTheDocument()
  expect(screen.getByTestId('login-institutional-lockup')).toHaveTextContent('PMPA · DITEL')
  expect(screen.getByText('Diretoria de Telemática')).toBeInTheDocument()
  expect(screen.getByTestId('login-access-anchor')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByLabelText('Matrícula')).toHaveAttribute('autoComplete', 'username')
  expect(screen.getByLabelText('Senha')).toHaveAttribute('autoComplete', 'current-password')
  expect(screen.getByTestId('login-mobile-context')).toHaveAttribute('aria-label', 'PMPA, Diretoria de Telemática')
  expect(screen.getByTestId('login-workflow')).toHaveAttribute('data-visual-variant', 'stationed-operational-flow')
  expect(screen.getByRole('button', { name: 'Mostrar' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
})

test('shows a generic message when fixture credentials fail', async () => {
  const user = userEvent.setup()
  render(<LoginPage onLogin={async (registration, password) => fixtureSessionAdapter.signIn(registration, password)} />)

  await user.type(screen.getByLabelText('Matrícula'), '999999')
  await user.type(screen.getByLabelText('Senha'), 'credencial-invalida')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByText('Não foi possível entrar com essas credenciais.')).toBeInTheDocument()
})

test('allows the user to reveal and hide the password', async () => {
  const user = userEvent.setup()
  render(<LoginPage onLogin={async () => null} />)

  const password = screen.getByLabelText('Senha')
  await user.click(screen.getByRole('button', { name: 'Mostrar' }))
  expect(password).toHaveAttribute('type', 'text')
  await user.click(screen.getByRole('button', { name: 'Ocultar' }))
  expect(password).toHaveAttribute('type', 'password')
})

test('submits matrícula and senha to the session adapter', async () => {
  const user = userEvent.setup()
  const onLogin = vi.fn(async () => null)
  render(<LoginPage onLogin={onLogin} />)

  await user.type(screen.getByLabelText('Matrícula'), '123456')
  await user.type(screen.getByLabelText('Senha'), 'senha-segura')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(onLogin).toHaveBeenCalledWith('123456', 'senha-segura')
})

test('disables submission while credentials are being verified', async () => {
  const user = userEvent.setup()
  let resolveLogin: (value: null) => void = () => undefined
  const onLogin = vi.fn(() => new Promise<null>((resolve) => { resolveLogin = resolve }))
  render(<LoginPage onLogin={onLogin} />)

  await user.type(screen.getByLabelText('Matrícula'), '123456')
  await user.type(screen.getByLabelText('Senha'), 'senha-segura')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Entrar' })).toHaveTextContent('Entrando…')

  resolveLogin(null)
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar com essas credenciais.')
})

test('restores the form with a generic error when sign-in is unavailable', async () => {
  const user = userEvent.setup()
  render(<LoginPage onLogin={async () => Promise.reject(new Error('Service unavailable'))} />)

  await user.type(screen.getByLabelText('Matrícula'), '123456')
  await user.type(screen.getByLabelText('Senha'), 'senha-segura')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar com essas credenciais.')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
})

test('creates the Unit session from valid fixture credentials', async () => {
  await expect(fixtureSessionAdapter.signIn('100001', 'sigat-unit')).resolves.toMatchObject({
    role: 'unit_user',
    unit: { id: 'unit-centro' },
  })
})

test('creates the DITEL session from valid fixture credentials', async () => {
  await expect(fixtureSessionAdapter.signIn('200001', 'sigat-ditel')).resolves.toMatchObject({
    role: 'ditel_admin',
    unit: null,
  })
})
