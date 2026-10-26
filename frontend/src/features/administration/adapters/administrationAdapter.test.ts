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

it('adapts and serializes an AC operator without inventing a unit', () => {
  const user = adaptAdminUser({ id: 'ac-1', name: 'Operador AC', registration: '300001', role: 'ac_operator', situation: 'active', unit: null, createdAt: '2026-10-26T10:00:00.000Z', updatedAt: '2026-10-26T11:00:00.000Z' })
  expect(user).toMatchObject({ profile: 'Operador AC', unit: 'Sem unidade — custódia AC', unitReference: null })
  expect(toAdminUserCreateRequest({ name: ' Operador AC ', registration: ' 300001 ', role: 'ac_operator', password: 'senha-segura', unit: null })).toEqual({ name: 'Operador AC', registration: '300001', role: 'ac_operator', password: 'senha-segura', unit: null })
  expect(toAdminUserUpdateRequest({ name: ' Operador AC ', registration: ' 300001 ', role: 'ac_operator', unit: null, updatedAt: '2026-10-26T11:00:00.000Z' })).toEqual({ name: 'Operador AC', registration: '300001', role: 'ac_operator', unit: null, updatedAt: '2026-10-26T11:00:00.000Z' })
})
