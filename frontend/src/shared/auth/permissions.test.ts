import { describe, expect, it } from 'vitest'
import { can, getNavigation } from './permissions'
import type { SessionContext } from './types'

const session: SessionContext = {
  userId: 'admin-1',
  registration: '200001',
  name: 'Admin DITEL',
  role: 'ditel_admin',
  unit: null,
}

describe('menu oficial (regra: não reintroduzir módulos removidos)', () => {
  it('expõe os módulos oficiais e as consultas AC para o administrador DITEL', () => {
    const labels = getNavigation(session).map((item) => item.label)
    expect(labels).toEqual(['Painel', 'Inventário', 'Chamados', 'Movimentações', 'Relatórios', 'Administração', 'Materiais AC', 'Transferências AC', 'Relatórios AC'])
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

  it('concede apenas os módulos AC ao operador AC', () => {
    const acSession: SessionContext = { ...session, role: 'ac_operator', unit: null }
    expect(getNavigation(acSession).map((item) => item.label)).toEqual(['Materiais AC', 'Transferências AC', 'Relatórios AC'])
    expect(can(acSession, 'ac_materials')).toBe(true)
    expect(can(acSession, 'ac_transfers')).toBe(true)
    expect(can(acSession, 'ac_reports')).toBe(true)
    expect(can(acSession, 'maintenance')).toBe(false)
    expect(can(acSession, 'missions')).toBe(false)
  })

  it('mantém rotas internas de manutenção e missões para perfis tradicionais', () => {
    const unitSession: SessionContext = { ...session, role: 'unit_user', unit: { id: 'unit-1', name: '1ª Companhia', acronym: '1CIA' } }
    expect(can(unitSession, 'maintenance')).toBe(true)
    expect(can(unitSession, 'missions')).toBe(true)
  })
})
