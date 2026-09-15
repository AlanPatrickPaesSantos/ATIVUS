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
  { label: 'Relatórios', href: '/relatorios', icon: '▤' },
  { label: 'Missões técnicas', href: '/missoes-tecnicas', icon: '⚑', secondary: true },
  { label: 'Auditoria', href: '/auditoria', icon: '◈', secondary: true },
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
  expect(screen.getByRole('list', { name: '' })).toHaveAttribute('data-alignment', 'page-center')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' }).closest('.top-nav__search')).toHaveAttribute('data-alignment', 'available-center')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' }).closest('.top-nav__search')).toHaveAttribute('data-actions-gap', 'comfortable')
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
  await user.click(screen.getByRole('menuitem', { name: 'Sair' }), { force: true })
  expect(onLogout).toHaveBeenCalledOnce()
})

test('desktop-wide shows all modules and the search without overlap', () => {
  setViewport(2200)
  renderTopNav('/painel')

  expect(screen.getByRole('navigation')).toHaveAttribute('data-layout', 'desktop-wide')
  // Todos os módulos visíveis, inclusive secundários
  expect(screen.getByRole('link', { name: /missões técnicas/i })).toBeVisible()
  expect(screen.getByRole('link', { name: /auditoria/i })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
  // Busca visível
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' })).toBeVisible()
})

test('desktop compact hides secondary modules behind Mais and never overlaps the context', () => {
  setViewport(1200)
  renderTopNav('/auditoria')

  const nav = screen.getByRole('navigation')
  expect(nav).toHaveAttribute('data-layout', 'desktop')

  const moreButton = screen.getByRole('button', { name: 'Mais ações' })
  // Secundários NÃO aparecem como links da barra; ficam só no menu Mais
  expect(screen.queryByRole('link', { name: /missões técnicas/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /auditoria/i })).not.toBeInTheDocument()
  // Abrir Mais mostra os itens secundários com aria correto
  expect(moreButton).toHaveAttribute('aria-haspopup', 'menu')
  expect(moreButton).toHaveAttribute('aria-expanded', 'false')
})

test('opens Mais menu, navigates to secondary item and closes', async () => {
  const user = userEvent.setup()
  setViewport(1200)
  renderTopNav('/painel')

  const moreButton = screen.getByRole('button', { name: 'Mais ações' })
  await user.click(moreButton)

  expect(moreButton).toHaveAttribute('aria-expanded', 'true')
  const menu = screen.getByRole('menu', { name: 'Mais ações' })
  expect(menu).toBeVisible()
  expect(screen.getByRole('menuitem', { name: /auditoria/i })).toBeVisible()

  await user.click(screen.getByRole('menuitem', { name: /auditoria/i }))
  expect(moreButton).toHaveAttribute('aria-expanded', 'false')
})

test('closes Mais menu on Escape and returns focus', async () => {
  const user = userEvent.setup()
  setViewport(1200)
  renderTopNav('/painel')

  const moreButton = screen.getByRole('button', { name: 'Mais ações' })
  await user.click(moreButton)
  expect(moreButton).toHaveAttribute('aria-expanded', 'true')

  await user.keyboard('{Escape}')
  expect(moreButton).toHaveAttribute('aria-expanded', 'false')
})

test('tablet layout keeps primary modules and moves secondary to Mais', () => {
  setViewport(800)
  renderTopNav('/movimentacoes')

  const nav = screen.getByRole('navigation')
  expect(nav).toHaveAttribute('data-layout', 'tablet')
  expect(screen.getByRole('link', { name: 'Painel' })).not.toHaveAttribute('hidden')
  expect(screen.getByRole('link', { name: /patrimônio/i })).not.toHaveAttribute('hidden')
  expect(screen.getByRole('button', { name: 'Mais ações' })).not.toHaveAttribute('hidden')
  // Secundários saem da barra
  expect(screen.queryByRole('link', { name: /auditoria/i })).not.toBeInTheDocument()
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

test('opens notification and help panels', async () => {
  const user = userEvent.setup()
  renderTopNav('/painel')
  await user.click(screen.getByRole('button', { name: 'Notificações' }))
  expect(screen.getByRole('status')).toHaveTextContent('Nenhuma notificação nova')
  await user.click(screen.getByRole('button', { name: 'Ajuda' }))
  expect(screen.getByRole('dialog', { name: 'Ajuda do SIGAT' })).toBeInTheDocument()
})