import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearSession, createSession } from '../../../shared/auth/session'
import { fixtureSessionAdapter } from '../../auth/data/sessionFixture'
import { server } from '../../../shared/api/msw/server'
import { createAdminUser, getAdminUsers, updateAdminUser, updateAdminUserSituation } from './administrationApi'

describe('getAdminUsers', () => {
  it('requests the administrative users endpoint with encoded pagination and filters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }))

    await getAdminUsers({ page: 1, pageSize: 20, search: 'Ana Souza', role: 'unit_user', situation: 'Ativo', unitId: 'unit/1' })

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/users?page=1&pageSize=20&search=Ana+Souza&role=unit_user&unitId=unit%2F1&situation=Ativo'), expect.objectContaining({ credentials: 'include' }))
    fetchMock.mockRestore()
  })
})

describe('updateAdminUserSituation', () => {
  it('sends the canonical situation PATCH with session credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'admin-1', situation: 'blocked' }), { status: 200 }))

    await updateAdminUserSituation('admin-1', 'blocked')

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/users/admin-1/situation'), expect.objectContaining({ method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situation: 'blocked' }) }))
    fetchMock.mockRestore()
  })
})

describe('createAdminUser', () => {
  it('sends the canonical administrative user creation payload with session credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'admin-5' }), { status: 201 }))

    await createAdminUser({ name: 'Ana Souza', registration: '123', role: 'unit_user', password: 'senha-segura', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' } })

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/users'), expect.objectContaining({ method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ana Souza', registration: '123', role: 'unit_user', password: 'senha-segura', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' } }) }))
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('passwordHash')
    fetchMock.mockRestore()
  })
})

describe('updateAdminUser', () => {
  it('sends only editable public fields with session credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'admin-1' }), { status: 200 }))

    await updateAdminUser('admin-1', { name: 'Ana Souza', registration: '123', role: 'unit_user', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, updatedAt: '2026-08-30T09:42:00.000Z' })

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/users/admin-1'), expect.objectContaining({ method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ana Souza', registration: '123', role: 'unit_user', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, updatedAt: '2026-08-30T09:42:00.000Z' }) }))
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/situation'), expect.anything())
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toMatch(/passwordHash|password|senha|token|tokenDigest|sessionId|situation/i)
    fetchMock.mockRestore()
  })
})

describe('getAdminUsers with the MSW API boundary', () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' })
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')
  })

  afterEach(() => server.resetHandlers())
  afterAll(() => {
    clearSession()
    server.close()
  })

  it('applies role, unit, situation, search and pagination while returning situation', async () => {
    const response = await getAdminUsers({ page: 1, pageSize: 1, role: 'unit_user', unitId: 'unit-centro', situation: 'Ativo', search: 'Ana' })

    expect(response).toMatchObject({ total: 1, page: 1, pageSize: 1 })
    expect(response.items).toEqual([expect.objectContaining({ name: 'Ana Souza', role: 'unit_user', situation: 'active', unit: expect.objectContaining({ id: 'unit-centro' }) })])

    await expect(getAdminUsers({ page: 2, pageSize: 1 })).resolves.toMatchObject({
      total: 4,
      page: 2,
      pageSize: 1,
      items: [expect.objectContaining({ name: 'Bruno Lima', situation: 'blocked' })],
    })
  })

  it('updates an active user and supports the canonical unblock transition', async () => {
    await expect(updateAdminUserSituation('admin-1', 'blocked')).resolves.toEqual({ id: 'admin-1', situation: 'blocked' })
    await expect(updateAdminUserSituation('admin-1', 'active')).resolves.toEqual({ id: 'admin-1', situation: 'active' })
  })

  it('creates a unit user through the MSW API boundary', async () => {
    await expect(createAdminUser({ name: 'Novo Usuário', registration: '30001', role: 'unit_user', password: 'senha-segura', unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' } })).resolves.toMatchObject({ name: 'Novo Usuário', registration: '30001', role: 'unit_user', situation: 'active' })
  })

  it('updates an administrative user through the MSW API boundary', async () => {
    const current = await getAdminUsers({ page: 1, pageSize: 20, search: 'Ana' })
    await expect(updateAdminUser('admin-1', { name: 'Ana Atualizada', registration: '123.456-7', role: 'unit_user', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, updatedAt: current.items[0].updatedAt })).resolves.toMatchObject({ id: 'admin-1', name: 'Ana Atualizada', registration: '123.456-7', role: 'unit_user', situation: 'active', unit: { id: 'unit-norte' } })
    await expect(getAdminUsers({ page: 1, pageSize: 20, unitId: 'unit-norte', search: 'Ana Atualizada' })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: 'admin-1', name: 'Ana Atualizada' })] })
  })
})
