import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { clearSession, createSession, setSession } from '../../../shared/auth/session'
import { fixtureSessionAdapter } from '../../../features/auth/data/sessionFixture'
import { server } from './server'
import { resetMockAuth } from './handlers'

describe('MSW fixture resets', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

  afterEach(() => {
    clearSession()
    resetMockAuth()
    server.resetHandlers()
  })

  afterAll(() => {
    clearSession()
    resetMockAuth()
    server.close()
  })

  it('restores administrative users when the mock state is reset', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

    const first = await fetch('http://localhost/api/v1/admin/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Usuário Temporário',
        registration: '30001',
        role: 'unit_user',
        password: 'senha-segura',
        unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
      }),
    })
    expect(first.status).toBe(201)

    resetMockAuth()
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

    const second = await fetch('http://localhost/api/v1/admin/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Usuário Temporário',
        registration: '30001',
        role: 'unit_user',
        password: 'senha-segura',
        unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
      }),
    })
    expect(second.status).toBe(201)
  })

  it('restores pending movements when the mock state is reset', async () => {
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')

    const first = await fetch('http://localhost/api/v1/movements', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipmentId: 'eq-002',
        destination: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
      }),
    })
    expect(first.status).toBe(201)

    resetMockAuth()
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')

    const second = await fetch('http://localhost/api/v1/movements', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipmentId: 'eq-002',
        destination: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
      }),
    })
    expect(second.status).toBe(201)
  })

  it('unlocks a must-change-password fixture session after password change', async () => {
    await createSession(fixtureSessionAdapter, '300001', 'senha-temporaria')

    const response = await fetch('http://localhost/api/v1/auth/password-change', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: 'nova-senha-segura' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      registration: '300001',
    })
    expect(body).not.toHaveProperty('mustChangePassword')
  })

  it('serves scoped report preview and CSV/PDF exports without sensitive fields', async () => {
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')

    const preview = await fetch('http://localhost/api/v1/reports/inventory-summary', {
      credentials: 'include',
    })
    expect(preview.status).toBe(200)
    const body = await preview.json()
    expect(body.report.scope).toMatchObject({ id: 'unit-centro' })
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i)

    const csv = await fetch('http://localhost/api/v1/reports/inventory-summary/export?format=csv', {
      credentials: 'include',
    })
    expect(csv.status).toBe(200)
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect(await csv.text()).toContain('Unidade,Total')

    const pdf = await fetch('http://localhost/api/v1/reports/inventory-summary/export?format=pdf', {
      credentials: 'include',
    })
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toContain('application/pdf')
    expect(await pdf.text()).toMatch(/^%PDF-/)
  })

  it('serves attachment download only within the owning unit scope or DITEL', async () => {
    const ownedCallAttachmentUrl = 'http://localhost/api/v1/attachments/att-call-402/download'

    // Unidade Centro owns call-402's attachment.
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')
    const allowed = await fetch(ownedCallAttachmentUrl, { credentials: 'include' })
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('content-type')).toContain('application/octet-stream')
    expect(await allowed.text()).toBe('conteudo-do-anexo')

    // DITEL can download any attachment.
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')
    const ditelAllowed = await fetch(ownedCallAttachmentUrl, { credentials: 'include' })
    expect(ditelAllowed.status).toBe(200)

    // A different unit cannot download another unit's attachment.
    setSession({
      userId: 'unit-norte-001',
      name: 'Bruno Lima',
      registration: '100002',
      role: 'unit_user',
      unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
    })
    const forbidden = await fetch(ownedCallAttachmentUrl, { credentials: 'include' })
    expect(forbidden.status).toBe(404)
  })
})
