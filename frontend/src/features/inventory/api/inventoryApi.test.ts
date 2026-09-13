import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/errors'
import { clearSession, createSession } from '../../../shared/auth/session'
import { fixtureSessionAdapter } from '../../auth/data/sessionFixture'
import { server } from '../../../shared/api/msw/server'
import { validateEquipmentAttachments } from './equipmentAttachments'
import { getEquipmentDetails, getInventory } from './inventoryApi'

describe('inventory API', () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' })
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')
  })

  afterEach(() => server.resetHandlers())
  afterAll(() => {
    clearSession()
    server.close()
  })

  it('sends allowed list filters and server pagination', async () => {
    const response = await getInventory({ search: 'dell', type: 'Computador portátil', model: 'Latitude 5420', situation: 'active', page: 1, pageSize: 1 })

    expect(response).toMatchObject({ total: 1, page: 1, pageSize: 1 })
    expect(response.items).toEqual([expect.objectContaining({ patrimony: 'PAT-2026-004827', model: 'Latitude 5420' })])
  })

  it('returns session-scoped equipment details without accepting an unknown id', async () => {
    await expect(getEquipmentDetails('eq-004')).resolves.toMatchObject({
      id: 'eq-004', patrimony: 'PAT-2026-004824', allocation: { location: 'CME' }, history: expect.any(Array), linkedCalls: expect.any(Array), documents: expect.any(Array),
    })
    const radio = await getEquipmentDetails('eq-001')
    expect(radio).toMatchObject({ allocation: { allocatedAt: '2026-02-18' }, linkedCalls: [{ openedAt: '2026-05-10' }] })
    expect(radio.documents).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'application/pdf', downloadUrl: '/api/v1/attachments/manual-apx/download' })]))
    await expect(getEquipmentDetails('not-in-unit')).rejects.toBeInstanceOf(ApiError)
  })

  it('does not expose another Unit equipment through the detail endpoint', async () => {
    await createSession({ signIn: async () => ({ userId: 'unit-002', name: 'Bruno Santos', registration: '100002', role: 'unit_user' as const, unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' } }) }, 'any', 'any')

    await expect(getEquipmentDetails('eq-004')).rejects.toMatchObject({ status: 404, code: 'EQUIPMENT_NOT_FOUND' })
  })

  it('allows DITEL to query statewide inventory and equipment details', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

    await expect(getInventory({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 10 })
    await expect(getInventory({ unitId: 'unit-norte', page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ unitName: 'Unidade Norte' })] })
    await expect(getEquipmentDetails('eq-101')).resolves.toMatchObject({ patrimony: 'UN-001', unitName: 'Unidade Norte' })
  })

  it('rejects an allowed inventory MIME when the file extension is not allowed in the UI and MSW contract', async () => {
    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')
    const attachment = new File(['pdf'], 'termo.exe', { type: 'application/pdf' })

    expect(() => validateEquipmentAttachments([attachment])).toThrow('Formato não permitido. Use PDF, JPG ou PNG.')

    const body = new FormData()
    body.set('patrimony', 'PAT-EXT-BAD')
    body.set('type', 'Notebook')
    body.set('model', 'Dell Latitude 5420')
    body.set('brand', 'Dell')
    body.set('situation', 'active')
    body.set('location', 'Sala de Testes')
    body.append('attachments', attachment)

    const response = await fetch('/api/v1/inventory', { method: 'POST', credentials: 'include', body })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_ATTACHMENT_TYPE',
      message: 'Tipo de anexo não permitido. Use PDF, JPG ou PNG.',
    })
  })
})
