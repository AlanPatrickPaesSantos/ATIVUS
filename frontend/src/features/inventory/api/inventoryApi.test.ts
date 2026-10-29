import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { ApiError } from '../../../shared/api/errors'
import { clearSession, createSession } from '../../../shared/auth/session'
import { fixtureSessionAdapter } from '../../auth/data/sessionFixture'
import { server } from '../../../shared/api/msw/server'
import { validateEquipmentAttachments } from './equipmentAttachments'
import { getEquipmentDetails, getInventory, getInventoryFacets, getPatrimonialView } from './inventoryApi'

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
    const response = await getInventory({ search: 'dell', commandId: 'command-north', type: 'Computador portátil', model: 'Latitude 5420', situation: 'active', page: 1, pageSize: 1 })

    expect(response).toMatchObject({ total: 1, page: 1, pageSize: 1 })
    expect(response.items).toEqual([expect.objectContaining({ patrimony: 'PAT-2026-004827', model: 'Latitude 5420' })])
  })

  it('returns authorized dynamic inventory facets', async () => {
    await expect(getInventoryFacets()).resolves.toMatchObject({
      units: [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }],
      types: expect.arrayContaining(['Computador portátil', 'Rádio portátil']),
      models: expect.arrayContaining(['APX 2000', 'Latitude 5420']),
      situations: expect.arrayContaining(['active', 'maintenance']),
      municipalities: ['Belém'],
      regions: ['Metropolitana'],
      sections: ['Suporte'],
    })
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

  it('requests the integrated patrimonial view with independent history and audit pagination', async () => {
    server.use(http.get('/api/v1/inventory/eq-001/patrimonial', ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('historyPage')).toBe('2')
      expect(url.searchParams.get('historyPageSize')).toBe('10')
      expect(url.searchParams.get('auditPage')).toBe('1')
      expect(url.searchParams.get('auditPageSize')).toBe('20')
      return HttpResponse.json({
        equipment: { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', category: 'Comunicação', situation: 'active', location: 'Sala', unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, custody: { scope: 'UNIT', unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' } }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
        activeOperation: null, history: { items: [], total: 0, page: 2, pageSize: 10 }, relatedCalls: [], documents: [], auditEvents: { items: [], total: 0, page: 1, pageSize: 20 },
      })
    }))

    await expect(getPatrimonialView('eq-001', { historyPage: 2, historyPageSize: 10, auditPage: 1, auditPageSize: 20 })).resolves.toMatchObject({
      equipment: { patrimony: 'PAT-2026-004821', custody: { scope: 'UNIT' } }, history: { page: 2, pageSize: 10 }, activeOperation: null,
    })
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
