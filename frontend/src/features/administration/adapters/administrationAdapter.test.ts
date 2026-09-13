import { expect, it } from 'vitest'
import { adaptAdminUser, toAdminUserCreateRequest, toAdminUserUpdateRequest } from './administrationAdapter'

it('adapts the public API user shape without carrying secret fields', () => {
  const user = adaptAdminUser({ id: '1', name: 'Ana', registration: '123', role: 'unit_user', situation: 'blocked', unit: { id: 'u1', name: 'Centro', acronym: 'CTR' }, createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T11:00:00.000Z' })
  expect(user).toMatchObject({ id: '1', name: 'Ana', registration: '123', profile: 'Usuário de unidade', unit: 'Centro', status: 'Bloqueado', updatedAtToken: '2026-08-30T11:00:00.000Z' })
  expect(user).not.toHaveProperty('passwordHash')
  expect(user).not.toHaveProperty('token')
})

it('maps a user draft to the public creation request without secret response fields', () => {
  expect(toAdminUserCreateRequest({ name: '  Ana Souza ', registration: ' 123 ', role: 'ditel_admin', password: 'senha-segura', unit: null })).toEqual({ name: 'Ana Souza', registration: '123', role: 'ditel_admin', password: 'senha-segura' })
})

it('maps a user edit draft to only editable public fields', () => {
  expect(toAdminUserUpdateRequest({ name: '  Ana Souza ', registration: ' 123 ', role: 'unit_user', unit: { id: 'u1', name: 'Centro', acronym: 'CTR' }, updatedAt: '2026-08-30T11:00:00.000Z' })).toEqual({ name: 'Ana Souza', registration: '123', role: 'unit_user', unit: { id: 'u1', name: 'Centro', acronym: 'CTR' }, updatedAt: '2026-08-30T11:00:00.000Z' })
  expect(toAdminUserUpdateRequest({ name: ' Admin ', registration: ' D1 ', role: 'ditel_admin', unit: null, updatedAt: '2026-08-30T12:00:00.000Z' })).toEqual({ name: 'Admin', registration: 'D1', role: 'ditel_admin', unit: null, updatedAt: '2026-08-30T12:00:00.000Z' })
})
