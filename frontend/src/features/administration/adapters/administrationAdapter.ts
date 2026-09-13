import type { AdminUserApi, AdminUserCreateRequest, AdminUserUpdateRequest } from '../api/administrationApi'
export type AdminUser = { id: string; name: string; registration: string; profile: 'Administrador DITEL' | 'Usuário de unidade'; role: AdminUserApi['role']; unit: string; unitReference: AdminUserApi['unit']; status: 'Ativo' | 'Bloqueado' | 'Inativo'; updatedAt: string; updatedAtToken: string }
export function adaptAdminUser(user: AdminUserApi): AdminUser { return { id: user.id, name: user.name, registration: user.registration, profile: user.role === 'ditel_admin' ? 'Administrador DITEL' : 'Usuário de unidade', role: user.role, unit: user.unit?.name ?? 'DITEL', unitReference: user.unit, status: user.situation === 'active' ? 'Ativo' : user.situation === 'blocked' ? 'Bloqueado' : 'Inativo', updatedAt: new Date(user.updatedAt).toLocaleString('pt-BR'), updatedAtToken: user.updatedAt } }

export type AdminUserDraft = { name: string; registration: string; role: 'ditel_admin' | 'unit_user'; password: string; unit: { id: string; name: string; acronym: string } | null }
export function toAdminUserCreateRequest(draft: AdminUserDraft): AdminUserCreateRequest {
  if (draft.role === 'unit_user') {
    if (!draft.unit) throw new Error('Selecione uma unidade para usuários de unidade.')
    return { name: draft.name.trim(), registration: draft.registration.trim(), role: 'unit_user', password: draft.password, unit: draft.unit }
  }
  return { name: draft.name.trim(), registration: draft.registration.trim(), role: 'ditel_admin', password: draft.password }
}

export type AdminUserEditDraft = { name: string; registration: string; role: 'ditel_admin' | 'unit_user'; unit: { id: string; name: string; acronym: string } | null; updatedAt: string }
export function toAdminUserUpdateRequest(draft: AdminUserEditDraft): AdminUserUpdateRequest {
  if (draft.role === 'unit_user') {
    if (!draft.unit) throw new Error('Selecione uma unidade para usuários de unidade.')
    return { name: draft.name.trim(), registration: draft.registration.trim(), role: 'unit_user', unit: draft.unit, updatedAt: draft.updatedAt }
  }
  return { name: draft.name.trim(), registration: draft.registration.trim(), role: 'ditel_admin', unit: null, updatedAt: draft.updatedAt }
}
