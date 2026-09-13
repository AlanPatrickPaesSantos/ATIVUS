import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SigatMark } from '../brand/SigatMark'

export type NavigationItem = {
  label: string
  href: string
  icon?: ReactNode
  requires?: string
}

export type AppContext = {
  unitName: string
  roleLabel: string
  scopeLabel: string
  userName: string
}

type TopNavProps = {
  items: NavigationItem[]
  activePath: string
  context: AppContext
  onLogout: () => void
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(query)
    if (!mediaQuery) return
    const updateMatches = () => setMatches(mediaQuery.matches)

    updateMatches()
    mediaQuery.addEventListener('change', updateMatches)
    return () => mediaQuery.removeEventListener('change', updateMatches)
  }, [query])

  return matches
}

function NavigationIcon({ href }: { href: string }) {
  const paths: Record<string, ReactNode> = {
    '/dashboard': <><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></>,
    '/inventario': <><path d="M5 7h14v13H5z"/><path d="M8 7V4h8v3M9 11h6M9 15h6"/></>,
    '/chamados': <><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13h3v6H5a1 1 0 0 1-1-1zm16 0h-3v6h2a1 1 0 0 0 1-1zM17 19c0 1.1-.9 2-2 2h-2"/></>,
    '/movimentacoes': <><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/></>,
    '/relatorios': <><path d="M5 20V10M12 20V4M19 20v-7M3 20h18"/></>,
    '/administracao': <><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></>,
  }
  return <svg className="top-nav__icon" viewBox="0 0 24 24" aria-hidden="true">{paths[href] ?? <circle cx="12" cy="12" r="7"/>}</svg>
}

export function TopNav({ items, activePath, context, onLogout }: TopNavProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [panel, setPanel] = useState<'notifications' | 'help' | null>(null)
  const [search, setSearch] = useState('')
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const isMobile = useMediaQuery('(max-width: 640px)')
  const isTablet = useMediaQuery('(max-width: 900px)')
  const isCompactDesktop = useMediaQuery('(max-width: 1950px)')
  const navigate = useNavigate()
  const layout = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'
  const shouldHideSearch = layout === 'mobile' || isCompactDesktop
  const activeItem = items.find((item) => item.href === activePath)
  const secondaryItems = items.slice(2)

  function closeMobileMenu() {
    setIsMobileMenuOpen(false)
    menuButtonRef.current?.focus()
  }

  return (
    <nav className="top-nav" aria-label="Navegação principal" data-layout={layout}>
      <div className="top-nav__start">
        <SigatMark />
        <button ref={menuButtonRef} className="top-nav__toggle top-nav__mobile-toggle" type="button" hidden={layout !== 'mobile'} aria-expanded={isMobileMenuOpen} aria-controls="main-navigation" onClick={() => setIsMobileMenuOpen((open) => !open)}>
          Menu
        </button>
        <ul id="main-navigation" className="top-nav__modules" data-alignment="page-center" data-open={isMobileMenuOpen}>
        <li className="top-nav__mobile-context" hidden={layout !== 'mobile'}>
          <span>Módulo atual</span>
          <strong>{activeItem?.label ?? 'Nenhum módulo'}</strong>
          <span>{context.unitName}</span>
        </li>
        <li className="top-nav__mobile-close" hidden={layout !== 'mobile'}>
          <button className="top-nav__toggle" type="button" onClick={closeMobileMenu}>Fechar menu</button>
        </li>
        {items.map((item, index) => (
          <li key={item.href} className={index < 2 ? 'top-nav__primary' : 'top-nav__secondary'} hidden={layout === 'tablet' && index >= 2}>
            <Link className="top-nav__link" to={item.href} onClick={closeMobileMenu} aria-current={item.href === activePath ? 'page' : undefined} data-nav-state={item.href === activePath ? 'active' : 'idle'}>
              <NavigationIcon href={item.href} />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
        {secondaryItems.length > 0 && (
          <li className="top-nav__more" hidden={layout !== 'tablet'}>
            <details open={isMoreOpen} onToggle={(event) => setIsMoreOpen((event.currentTarget as HTMLDetailsElement).open)}>
              <summary className="top-nav__toggle" role="button" aria-haspopup="menu" aria-expanded={isMoreOpen} aria-label="Mais ações">Mais</summary>
              {secondaryItems.map((item) => (
                <Link key={item.href} className="top-nav__link" to={item.href} onClick={closeMobileMenu} aria-current={item.href === activePath ? 'page' : undefined} data-nav-state={item.href === activePath ? 'active' : 'idle'}>
                  {item.label}
                </Link>
              ))}
            </details>
          </li>
        )}
        </ul>
      </div>
      <label className="top-nav__search" data-alignment="available-center" data-actions-gap="comfortable" hidden={shouldHideSearch}>
        <span>Buscar no sistema</span>
        <input aria-label="Buscar no sistema" placeholder="Buscar no sistema" type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && search.trim()) navigate(`/inventario?search=${encodeURIComponent(search.trim())}`) }} />
      </label>
      <div className="top-nav__end" data-alignment="right">
        <div className="top-nav__context" aria-label="Contexto da sessão" hidden={layout === 'mobile'}>
          <strong>{context.unitName}</strong>
          <span>{context.scopeLabel}</span>
        </div>
        <button className="top-nav__notification-btn" type="button" aria-label="Notificações" aria-haspopup="dialog" aria-expanded={panel === 'notifications'} aria-controls="notifications-menu" hidden={layout === 'mobile'} onClick={() => setPanel(panel === 'notifications' ? null : 'notifications')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="top-nav__action-icon">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span className="top-nav__notification-badge" />
        </button>
        <button className="top-nav__help-btn" type="button" aria-label="Ajuda" hidden={layout === 'mobile'} onClick={() => setPanel(panel === 'help' ? null : 'help')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="top-nav__action-icon">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        </button>
        <button className="top-nav__profile" type="button" hidden={layout === 'mobile'} aria-expanded={isProfileOpen} aria-haspopup="menu" aria-controls="profile-menu" onClick={() => setIsProfileOpen((open) => !open)} aria-label={context.userName}>
          <span aria-hidden="true">{context.userName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
          <span className="top-nav__profile-name" style={{ display: 'none' }}>{context.userName}</span>
        </button>
      </div>
      {isProfileOpen && (
        <section id="profile-menu" className="top-nav__menu" role="menu" aria-label="Perfil do usuário">
          <strong>{context.userName}</strong>
          <p>{context.roleLabel}</p>
          <button className="top-nav__logout" type="button" onClick={onLogout}>Sair</button>
        </section>
      )}
      {panel === 'notifications' && <section id="notifications-menu" className="top-nav__menu" aria-label="Notificações"><strong>Notificações</strong><p role="status">Nenhuma notificação nova</p></section>}
      {panel === 'help' && <section id="help-menu" className="top-nav__menu" role="dialog" aria-label="Ajuda do SIGAT"><strong>Ajuda do SIGAT</strong><p>Consulte os módulos pelo menu. Para suporte, procure a equipe responsável pelo SIGAT.</p><button type="button" onClick={() => setPanel(null)}>Fechar</button></section>}
    </nav>
  )
}
