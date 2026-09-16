import { describe, expect, it } from 'vitest'
import { getNavigation } from './permissions'
import type { SessionContext } from './types'

const session: SessionContext = {
  userId: 'admin-1',
  registration: '200001',
  name: 'Admin DITEL',
  role: 'ditel_admin',
  unit: null,
}

describe('menu oficial (regra: não reintroduzir módulos removidos)', () => {
  it('expõe exatamente os 6 módulos oficiais para o administrador DITEL', () => {
    const labels = getNavigation(session).map((item) => item.label)
    expect(labels).toEqual(['Painel', 'Inventário', 'Chamados', 'Movimentações', 'Relatórios', 'Administração'])
  })

  it('não inclui Manutenção, Missões técnicas, Tipos de equipamento ou Auditoria', () => {
    const labels = getNavigation(session).map((item) => item.label)
    for (const removed of ['Manutenção', 'Missões técnicas', 'Tipos de equipamento', 'Auditoria']) {
      expect(labels).not.toContain(removed)
    }
  })

  it('mantém relatórios e painel centralizados no menu do usuário de unidade', () => {
    const unitSession: SessionContext = { ...session, role: 'unit_user', unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' } }
    const labels = getNavigation(unitSession).map((item) => item.label)
    expect(labels).toEqual(['Painel', 'Inventário', 'Chamados', 'Movimentações', 'Relatórios'])
    expect(labels).not.toContain('Administração')
  })
})