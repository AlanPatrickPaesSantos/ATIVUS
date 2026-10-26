import type { NavigationItem, SessionContext } from './types'

const permissionsByRole = {
  ditel_admin: ['dashboard', 'inventory', 'tickets', 'movements', 'reports', 'administration', 'maintenance', 'missions', 'ac_materials', 'ac_transfers', 'ac_reports'],
  unit_user: ['dashboard', 'inventory', 'tickets', 'movements', 'reports', 'maintenance', 'missions'],
  ac_operator: ['ac_materials', 'ac_transfers', 'ac_reports'],
} as const

const navigation: NavigationItem[] = [
  { label: 'Painel', href: '/dashboard', icon: '◈', requires: 'dashboard' },
  { label: 'Inventário', href: '/inventario', icon: '▣', requires: 'inventory' },
  { label: 'Chamados', href: '/chamados', icon: '◌', requires: 'tickets' },
  { label: 'Movimentações', href: '/movimentacoes', icon: '↔', requires: 'movements' },
  { label: 'Relatórios', href: '/relatorios', icon: '▤', requires: 'reports' },
  { label: 'Administração', href: '/administracao', icon: '⚙', requires: 'administration' },
  { label: 'Materiais AC', href: '/ac/materiais', icon: '▥', requires: 'ac_materials' },
  { label: 'Transferências AC', href: '/ac/transferencias', icon: '⇢', requires: 'ac_transfers' },
  { label: 'Relatórios AC', href: '/ac/relatorios', icon: '▤', requires: 'ac_reports' },
]

export function can(session: SessionContext, permission: string): boolean {
  return permissionsByRole[session.role].includes(permission as never)
}

export function getNavigation(session: SessionContext): NavigationItem[] {
  return navigation.filter((item) => !item.requires || can(session, item.requires))
}
