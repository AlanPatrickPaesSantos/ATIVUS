import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { NetworkError, RequestCancelledError, RequestTimeoutError, UnauthorizedError } from './errors'
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

  it('parses a successful JSON response from the API base URL', async () => {
    server.use(http.get('*/api/v1/health', () => HttpResponse.json({ ok: true })))

    await expect(httpClient<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true })
  })

  it('normalizes a 401 API response into an ApiError', async () => {
    server.use(http.get('*/api/v1/protected', () => HttpResponse.json(
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
    server.use(http.get('*/api/v1/session', ({ request }) => {
      expect(request.credentials).toBe('include')
      return HttpResponse.json({ authenticated: true })
    }))

    await expect(httpClient<{ authenticated: boolean }>('/session')).resolves.toEqual({ authenticated: true })
  })

  it('accepts successful responses without a JSON body', async () => {
    server.use(http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })))

    await expect(httpClient<void>('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it.each([401, 403, 409, 429, 500])('preserves confirmed HTTP status %s as ApiError', async (status) => {
    server.use(http.get('*/api/v1/status', () => HttpResponse.json({ code: `HTTP_${status}`, message: 'Falha confirmada' }, { status })))

    const error = await httpClient('/status').catch((caught: unknown) => caught)

    expect(error).toMatchObject({ status, code: `HTTP_${status}`, message: 'Falha confirmada' })
    expect(error).not.toBeInstanceOf(NetworkError)
  })

  it('raises a timeout without retrying the request', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/slow', async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 50))
      return HttpResponse.json({ ok: true })
    }))

    const error = await httpClient('/slow', {}, { timeoutMs: 5 }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RequestTimeoutError)
    expect(calls).toBe(1)
  })

  it('distinguishes caller cancellation from timeout', async () => {
    const controller = new AbortController()
    server.use(http.get('*/api/v1/cancelled', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return HttpResponse.json({ ok: true })
    }))

    const promise = httpClient('/cancelled', { signal: controller.signal }, { timeoutMs: 100 })
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(RequestCancelledError)
  })

  it('normalizes a network failure without fabricating an HTTP response', async () => {
    server.use(http.get('*/api/v1/unreachable', () => HttpResponse.error()))

    await expect(httpClient('/unreachable')).rejects.toBeInstanceOf(NetworkError)
  })
})
