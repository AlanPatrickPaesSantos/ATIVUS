import type { NavigationItem, SessionContext } from './types'

const permissionsByRole = {
  ditel_admin: ['dashboard', 'inventory', 'tickets', 'movements', 'reports', 'administration', 'maintenance'],
  unit_user: ['dashboard', 'inventory', 'tickets', 'movements', 'reports', 'maintenance'],
} as const

const navigation: NavigationItem[] = [
  { label: 'Painel', href: '/dashboard', icon: '◈', requires: 'dashboard' },
  { label: 'Inventário', href: '/inventario', icon: '▣', requires: 'inventory' },
  { label: 'Chamados', href: '/chamados', icon: '◌', requires: 'tickets' },
  { label: 'Movimentações', href: '/movimentacoes', icon: '↔', requires: 'movements' },
  { label: 'Relatórios', href: '/relatorios', icon: '▤', requires: 'reports' },
  { label: 'Manutenção', href: '/manutencao', icon: '⚒', requires: 'maintenance' },
  { label: 'Missões técnicas', href: '/missoes-tecnicas', icon: '⚑', requires: 'maintenance' },
  { label: 'Tipos de equipamento', href: '/tipos-equipamento', icon: '▣', requires: 'administration' },
  { label: 'Auditoria', href: '/auditoria', icon: '◈', requires: 'administration' },
  { label: 'Administração', href: '/administracao', icon: '⚙', requires: 'administration' },
]

export function can(session: SessionContext, permission: string): boolean {
  return permissionsByRole[session.role].includes(permission as never)
}

export function getNavigation(session: SessionContext): NavigationItem[] {
  return navigation.filter((item) => !item.requires || can(session, item.requires))
}
