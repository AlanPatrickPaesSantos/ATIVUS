import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearSession, createSession } from '../../../shared/auth/session'
import { fixtureSessionAdapter } from '../../auth/data/sessionFixture'
import { server } from '../../../shared/api/msw/server'
import { resetMockAuth } from '../../../shared/api/msw/handlers'
import { getCallDetails, getCalls, triageCall, validateAttachments } from './callsApi'

describe('calls API', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    vi.restoreAllMocks()
    server.resetHandlers()
    resetMockAuth()
    clearSession()
  })
  afterAll(() => {
    clearSession()
    server.close()
  })

  it('returns the statewide critical-call queue for DITEL', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

    await expect(getCalls()).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ subject: 'Falha de conectividade no CIOp', unitName: 'CIOp Metropolitano' })]),
    })
  })

  it('returns public call details with history from the API without secrets', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

    const details = await getCallDetails('call-401')

    expect(details).toMatchObject({
      id: 'call-401',
      protocol: 'CH-2026-0401',
      subject: 'Falha de conectividade no CIOp',
      description: 'Descrição persistida da API para o CIOp.',
      requestedBy: 'Equipe do CIOp',
      equipment: { id: 'eq-ciop-link', patrimony: 'CIOP-LINK-01', type: 'Switch', model: 'Core 9000', brand: 'Cisco' },
      attachments: [],
      history: expect.arrayContaining([expect.objectContaining({ description: 'Chamado aberto pela Unidade.' })]),
    })
    expect(JSON.stringify(details)).not.toMatch(/passwordHash|password|senha|token|tokenDigest|sessionId|registration/i)
  })

  it('sends the DITEL triage decision with the server version and no unrelated fields', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await triageCall('call-401', { status: 'Resolvido', priority: 'high', section: 'Suporte', updatedAt: '2026-08-30T08:00:00.000Z' })

    const [, init] = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/calls/call-401/triage')) ?? []
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(String(init?.body))).toEqual({
      status: 'Resolvido',
      priority: 'high',
      section: 'Suporte',
      updatedAt: '2026-08-30T08:00:00.000Z',
    })
    expect(String(init?.body)).not.toMatch(/description|token|password|senha|session/i)
  })

  it('persists DITEL triage in the MSW call queue', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')

    const before = await getCalls()
    const call = before.items.find((item) => item.id === 'call-401')
    expect(call).toMatchObject({ status: 'Em atendimento', updatedAt: '2026-08-30T08:00:00.000Z' })
    expect(call).not.toHaveProperty('section')

    const updated = await triageCall('call-401', { status: 'Encerrado', priority: 'low', section: 'Suporte', updatedAt: call?.updatedAt ?? '' })
    expect(updated).toMatchObject({ id: 'call-401', status: 'Encerrado', priority: 'Baixa', section: 'Suporte' })

    await expect(getCalls()).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: 'call-401', status: 'Encerrado', priority: 'Baixa', section: 'Suporte', updatedAt: updated.updatedAt })]),
    })
  })

  it('rejects stale MSW triage decisions with USER_CONFLICT', async () => {
    await createSession(fixtureSessionAdapter, '200001', 'sigat-ditel')
    const before = await getCalls()
    const original = before.items.find((item) => item.id === 'call-401')
    expect(original?.updatedAt).toBe('2026-08-30T08:00:00.000Z')
    await triageCall('call-401', { status: 'Resolvido', priority: 'high', section: 'Telecom', updatedAt: original?.updatedAt ?? '' })

    await expect(triageCall('call-401', { status: 'Encerrado', priority: 'low', section: 'Suporte', updatedAt: original?.updatedAt ?? '' })).rejects.toMatchObject({
      code: 'USER_CONFLICT',
      message: 'O chamado foi alterado por outra operação. Recarregue os dados e tente novamente.',
    })
  })

  it('rejects more than five attachments before submitting a call and in the MSW contract', async () => {
    const attachments = Array.from({ length: 6 }, (_item, index) => new File(['pdf'], `evidencia-${index + 1}.pdf`, { type: 'application/pdf' }))

    expect(() => validateAttachments(attachments)).toThrow('Você pode anexar no máximo 5 arquivos.')

    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')
    const body = new FormData()
    body.set('problem', 'software')
    body.set('priority', 'medium')
    body.set('subject', 'Falha com muitas evidências')
    body.set('description', 'Seis anexos devem ser rejeitados pelo contrato simulado.')
    attachments.forEach((attachment) => body.append('attachments', attachment))

    const response = await fetch('/api/v1/calls', { method: 'POST', credentials: 'include', body })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'ATTACHMENT_LIMIT_EXCEEDED',
      message: 'Você pode anexar no máximo 5 arquivos.',
    })
  })

  it('rejects an allowed call MIME when the file extension is not allowed in the UI and MSW contract', async () => {
    const attachment = new File(['pdf'], 'evidencia.exe', { type: 'application/pdf' })

    expect(() => validateAttachments([attachment])).toThrow('Tipo de anexo não permitido')

    await createSession(fixtureSessionAdapter, '100001', 'sigat-unit')
    const body = new FormData()
    body.set('problem', 'software')
    body.set('priority', 'medium')
    body.set('subject', 'Falha com extensão inválida')
    body.set('description', 'MIME permitido com extensão executável deve ser rejeitado.')
    body.append('attachments', attachment)

    const response = await fetch('/api/v1/calls', { method: 'POST', credentials: 'include', body })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_ATTACHMENT_TYPE',
      message: 'Tipo de anexo não permitido. Use documentos PDF/DOC/DOCX ou fotos JPG/PNG/WEBP/GIF.',
    })
  })
})
