import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { UnauthorizedError } from './errors'
import { httpClient } from './httpClient'
import { server } from './msw/server'

describe('httpClient', () => {
  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api/v1')
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => server.resetHandlers())
  afterAll(() => {
    server.close()
    vi.unstubAllEnvs()
  })

  it('parses a successful JSON response from the configured API base URL', async () => {
    server.use(http.get('http://localhost/api/v1/health', () => HttpResponse.json({ ok: true })))

    await expect(httpClient<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true })
  })

  it('normalizes a 401 API response into an ApiError', async () => {
    server.use(http.get('http://localhost/api/v1/protected', () => HttpResponse.json(
      { code: 'UNAUTHENTICATED', message: 'Sessão expirada', details: { reason: 'expired' } },
      { status: 401 },
    )))

    const error = await httpClient('/protected').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(UnauthorizedError)
    expect(error).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Sessão expirada',
      details: { reason: 'expired' },
    })
  })

  it('sends credentials with every request', async () => {
    server.use(http.get('http://localhost/api/v1/session', ({ request }) => {
      expect(request.credentials).toBe('include')
      return HttpResponse.json({ authenticated: true })
    }))

    await expect(httpClient<{ authenticated: boolean }>('/session')).resolves.toEqual({ authenticated: true })
  })

  it('accepts successful responses without a JSON body', async () => {
    server.use(http.post('http://localhost/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })))

    await expect(httpClient<void>('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })
})
