import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach } from 'vitest'
import { TopNav, type AppContext, type NavigationItem } from './TopNav'

const navigation: NavigationItem[] = [
  { label: 'Painel', href: '/painel', icon: '◈' },
  { label: 'Patrimônio', href: '/patrimonio', icon: '▣' },
  { label: 'Movimentações', href: '/movimentacoes', icon: '↔' },
]

const context: AppContext = {
  unitName: 'Unidade Centro',
  roleLabel: 'Gestor de patrimônio',
  scopeLabel: 'Escopo regional',
  userName: 'Ana Souza',
}

function setViewport(width: number) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: width <= Number(query.match(/max-width:\s*(\d+)px/)?.[1] ?? 0),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
}

function renderTopNav(activePath: string, onLogout = () => undefined) {
  return render(
    <MemoryRouter>
      <TopNav items={navigation} activePath={activePath} context={context} onLogout={onLogout} />
    </MemoryRouter>,
  )
}

beforeEach(() => setViewport(2200))
afterEach(() => vi.unstubAllGlobals())

test('marks the active module and shows the unit context', () => {
  renderTopNav('/patrimonio')

  expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
  expect(screen.queryByText('COMANDO AMAZÔNICO')).not.toBeInTheDocument()
  expect(screen.getByRole('list', { name: '' })).toHaveAttribute('data-alignment', 'page-center')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' }).closest('.top-nav__search')).toHaveAttribute('data-alignment', 'available-center')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' }).closest('.top-nav__search')).toHaveAttribute('data-actions-gap', 'comfortable')
  expect(screen.getByRole('button', { name: /ana souza/i }).closest('.top-nav__end')).toHaveAttribute('data-alignment', 'right')
  expect(screen.getByRole('link', { name: /patrimônio/i })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' })).toBeInTheDocument()
  expect(screen.getByText('Unidade Centro', { selector: '.top-nav__context strong' })).toBeInTheDocument()
})

test('keeps the brand corner free of decorative symbols', () => {
  renderTopNav('/painel')

  expect(screen.getByRole('link', { name: /sigat/i })).toHaveTextContent('SIGAT')
  expect(document.querySelector('.top-nav__rail-icon')).not.toBeInTheDocument()
})

test('exposes the active module as the current operational destination', () => {
  renderTopNav('/patrimonio')

  expect(screen.getByRole('link', { name: /patrimônio/i })).toHaveAttribute('data-nav-state', 'active')
  expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('data-nav-state', 'idle')
})

test('opens the profile menu by keyboard and provides an explicit logout action', async () => {
  const user = userEvent.setup()
  const onLogout = vi.fn()

  renderTopNav('/painel', onLogout)

  const profileButton = screen.getByRole('button', { name: /ana souza/i })
  profileButton.focus()
  await user.keyboard('{Enter}')

  expect(profileButton).toHaveAttribute('aria-expanded', 'true')
  await user.click(screen.getByRole('button', { name: 'Sair' }))
  expect(onLogout).toHaveBeenCalledOnce()
})

test('hides global search before it can overlap the centered desktop modules', () => {
  setViewport(1800)
  renderTopNav('/painel')

  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema', hidden: true }).closest('.top-nav__search')).toHaveAttribute('hidden')
})

test('shows an active secondary item in the tablet Mais menu', () => {
  setViewport(800)
  renderTopNav('/movimentacoes')

  expect(screen.getByRole('navigation')).toHaveAttribute('data-layout', 'tablet')
  expect(screen.getByRole('link', { name: 'Painel' })).not.toHaveAttribute('hidden')
  expect(screen.getByRole('link', { name: /patrimônio/i })).not.toHaveAttribute('hidden')
  expect(screen.getByText('Mais').closest('li')).not.toHaveAttribute('hidden')
  expect(screen.getAllByRole('link', { name: /movimentações/i, hidden: true })[0].closest('li')).toHaveAttribute('hidden')
  expect(screen.getByRole('link', { name: /movimentações/i })).toHaveAttribute('aria-current', 'page')
})

test('opens and closes the mobile menu with current module and context visible', async () => {
  const user = userEvent.setup()
  setViewport(480)

  renderTopNav('/patrimonio')

  const menuButton = screen.getByRole('button', { name: 'Menu' })
  expect(screen.getByRole('navigation')).toHaveAttribute('data-layout', 'mobile')
  await user.click(menuButton)

  expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Módulo atual')).toBeInTheDocument()
  expect(screen.getByText('Patrimônio', { selector: '.top-nav__mobile-context strong' })).toBeInTheDocument()
  expect(screen.getByText('Unidade Centro', { selector: '.top-nav__mobile-context span' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Fechar menu' }))
  expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  expect(document.activeElement).toBe(menuButton)
  expect(screen.queryByRole('button', { name: /ana souza/i })).not.toBeInTheDocument()
})

test('opens and closes the tablet Mais actions menu with proper aria state', async () => {
  const user = userEvent.setup()
  setViewport(800)
  renderTopNav('/movimentacoes')

  const moreButton = screen.getByRole('button', { name: 'Mais ações' })
  expect(moreButton).toHaveAttribute('aria-expanded', 'false')
  expect(moreButton).toHaveAttribute('aria-haspopup', 'menu')

  await user.click(moreButton)
  expect(moreButton).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('link', { name: /movimentações/i })).toBeVisible()
})

test('opens notification and help panels', async () => {
  const user = userEvent.setup()
  renderTopNav('/painel')
  await user.click(screen.getByRole('button', { name: 'Notificações' }))
  expect(screen.getByRole('status')).toHaveTextContent('Nenhuma notificação nova')
  await user.click(screen.getByRole('button', { name: 'Ajuda' }))
  expect(screen.getByRole('dialog', { name: 'Ajuda do SIGAT' })).toBeInTheDocument()
})
