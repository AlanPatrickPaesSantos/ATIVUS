import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach } from 'vitest'
import { TopNav, type AppContext, type NavigationItem } from './TopNav'

// Menu oficial: 6 módulos (admin DITEL). Sem Manutenção / Missões técnicas / Tipos / Auditoria.
const navigation: NavigationItem[] = [
  { label: 'Painel', href: '/painel', icon: '◈' },
  { label: 'Inventário', href: '/inventario', icon: '▣' },
  { label: 'Chamados', href: '/chamados', icon: '◌' },
  { label: 'Movimentações', href: '/movimentacoes', icon: '↔' },
  { label: 'Relatórios', href: '/relatorios', icon: '▤' },
  { label: 'Administração', href: '/administracao', icon: '⚙' },
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

function renderTopNav(activePath: string, onLogout = () => undefined, items = navigation) {
  return render(
    <MemoryRouter>
      <TopNav items={items} activePath={activePath} context={context} onLogout={onLogout} />
    </MemoryRouter>,
  )
}

beforeEach(() => setViewport(2200))
afterEach(() => vi.unstubAllGlobals())

test('marks the active module and shows the unit context', () => {
  renderTopNav('/inventario')

  expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
  expect(screen.getByRole('list', { name: '' })).toHaveAttribute('data-alignment', 'page-center')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' }).closest('.top-nav__search')).toHaveAttribute('data-alignment', 'available-center')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' }).closest('.top-nav__search')).toHaveAttribute('data-actions-gap', 'comfortable')
  expect(screen.getByRole('link', { name: /inventário/i })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' })).toBeInTheDocument()
})

test('does not render the textual session context (unit name / scope) in the top bar', () => {
  renderTopNav('/painel')

  expect(screen.queryByText('Unidade Centro', { selector: '.top-nav__context strong' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Escopo regional/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/Escopo estadual/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/contexto da sessão/i)).not.toBeInTheDocument()
})

test('keeps the brand corner free of decorative symbols', () => {
  renderTopNav('/painel')

  expect(screen.getByRole('link', { name: /sigat/i })).toHaveTextContent('SIGAT')
  expect(document.querySelector('.top-nav__rail-icon')).not.toBeInTheDocument()
})

test('exposes the active module as the current operational destination', () => {
  renderTopNav('/inventario')

  expect(screen.getByRole('link', { name: /inventário/i })).toHaveAttribute('data-nav-state', 'active')
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

test('desktop-wide shows all official modules and the search without overlap', () => {
  setViewport(2200)
  renderTopNav('/painel')

  expect(screen.getByRole('navigation')).toHaveAttribute('data-layout', 'desktop-wide')
  for (const label of ['Painel', 'Inventário', 'Chamados', 'Movimentações', 'Relatórios', 'Administração']) {
    expect(screen.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  expect(screen.getByRole('searchbox', { name: 'Buscar no sistema' })).toBeVisible()
  // Manutenção e módulos removidos do menu oficial não aparecem
  expect(screen.queryByRole('link', { name: /manutenção/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /missões técnicas/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /tipos de equipamento/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /auditoria/i })).not.toBeInTheDocument()
})

test('desktop compact fits all official modules without Mais actions', () => {
  setViewport(1200)
  renderTopNav('/painel')

  const nav = screen.getByRole('navigation')
  expect(nav).toHaveAttribute('data-layout', 'desktop')

  // Sem excedente: os 6 módulos oficiais cabem na barra, sem botão "Mais ações"
  expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
  for (const label of ['Painel', 'Inventário', 'Chamados', 'Movimentações', 'Relatórios', 'Administração']) {
    expect(screen.getByRole('link', { name: label, exact: true })).toBeVisible()
  }

  // Módulos removidos nunca aparecem, nem no menu Mais
  expect(screen.queryByRole('link', { name: /manutenção/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /missões técnicas/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /tipos de equipamento/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /auditoria/i })).not.toBeInTheDocument()
})

test('opens Mais menu, navigates to trailing module and closes', async () => {
  const user = userEvent.setup()
  setViewport(800)
  renderTopNav('/painel')

  const moreButton = screen.getByRole('button', { name: 'Mais ações' })
  await user.click(moreButton)

  expect(moreButton).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('menu', { name: 'Mais ações' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Relatórios', exact: true })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Administração', exact: true })).toBeInTheDocument()

  await user.click(screen.getByRole('menuitem', { name: /administração/i }))
  expect(moreButton).toHaveAttribute('aria-expanded', 'false')
})

test('closes Mais menu on Escape and returns focus', async () => {
  const user = userEvent.setup()
  setViewport(800)
  renderTopNav('/painel')

  const moreButton = screen.getByRole('button', { name: 'Mais ações' })
  await user.click(moreButton)
  expect(moreButton).toHaveAttribute('aria-expanded', 'true')

  await user.keyboard('{Escape}')
  expect(moreButton).toHaveAttribute('aria-expanded', 'false')
})

test('tablet layout keeps core modules and moves trailing modules to Mais', () => {
  setViewport(800)
  renderTopNav('/movimentacoes')

  const nav = screen.getByRole('navigation')
  expect(nav).toHaveAttribute('data-layout', 'tablet')
  expect(screen.getByRole('link', { name: 'Painel' })).not.toHaveAttribute('hidden')
  expect(screen.getByRole('link', { name: /inventário/i })).not.toHaveAttribute('hidden')
  expect(screen.getByRole('button', { name: 'Mais ações' })).not.toHaveAttribute('hidden')
  // Relatórios e Administração ficam atrás de Mais no tablet
  expect(screen.queryByRole('link', { name: /relatórios/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /administração/i })).not.toBeInTheDocument()
  // Manutenção não é módulo oficial
  expect(screen.queryByRole('link', { name: /manutenção/i })).not.toBeInTheDocument()
})

test('opens and closes the mobile menu with current module and context visible', async () => {
  const user = userEvent.setup()
  setViewport(480)

  renderTopNav('/inventario')

  const menuButton = screen.getByRole('button', { name: 'Menu' })
  expect(screen.getByRole('navigation')).toHaveAttribute('data-layout', 'mobile')
  await user.click(menuButton)

  expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Módulo atual')).toBeInTheDocument()
  expect(screen.getByText('Inventário', { selector: '.top-nav__mobile-context strong' })).toBeInTheDocument()
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