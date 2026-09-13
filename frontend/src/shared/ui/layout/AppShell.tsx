import type { ReactNode } from 'react'
import { TopNav, type AppContext, type NavigationItem } from '../navigation/TopNav'

type AppShellProps = {
  children: ReactNode
  context: AppContext
  navigation: NavigationItem[]
  activePath: string
  onLogout: () => void
}

export function AppShell({ children, context, navigation, activePath, onLogout }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
      <TopNav items={navigation} activePath={activePath} context={context} onLogout={onLogout} />
      <main id="main-content" className="app-shell__content" data-scope={context.scopeLabel} tabIndex={-1} aria-label="Conteúdo principal">{children}</main>
    </div>
  )
}
