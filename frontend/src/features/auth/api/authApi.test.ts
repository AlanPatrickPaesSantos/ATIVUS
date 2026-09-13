import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../shared/api/msw/server'
import { authApi } from './authApi'

describe('authApi', () => {
  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost/api/v1')
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => server.resetHandlers())
  afterAll(() => {
    server.close()
    vi.unstubAllEnvs()
  })

  it('posts matrícula and senha to the real login endpoint with credentials included', async () => {
    server.use(http.post('http://localhost/api/v1/auth/login', async ({ request }) => {
      expect(request.credentials).toBe('include')
      expect(request.headers.get('content-type')).toContain('application/json')
      await expect(request.json()).resolves.toEqual({ registration: '200001', password: 'sigat-ditel' })
      return HttpResponse.json({
        userId: 'ditel-001',
        name: 'Carlos Lima',
        registration: '200001',
        role: 'ditel_admin',
        unit: null,
      })
    }))

    await expect(authApi.signIn('200001', 'sigat-ditel')).resolves.toEqual({
      userId: 'ditel-001',
      name: 'Carlos Lima',
      registration: '200001',
      role: 'ditel_admin',
      unit: null,
    })
  })

  it('returns null for invalid credentials without exposing the API error', async () => {
    server.use(http.post('http://localhost/api/v1/auth/login', () => HttpResponse.json(
      { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas.' },
      { status: 401 },
    )))

    await expect(authApi.signIn('999999', 'credencial-invalida')).resolves.toBeNull()
  })

  it('keeps non-authentication failures available to the login UI', async () => {
    server.use(http.post('http://localhost/api/v1/auth/login', () => HttpResponse.json(
      { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
      { status: 500 },
    )))

    await expect(authApi.signIn('200001', 'sigat-ditel')).rejects.toMatchObject({ status: 500 })
  })

  it.each([
    ['DITEL', '200001', 'sigat-ditel', { role: 'ditel_admin', unit: null }],
    ['Unidade', '100001', 'sigat-unit', { role: 'unit_user', unit: { id: 'unit-centro' } }],
  ])('returns the real session context for a valid %s user', async (_label, registration, password, expected) => {
    server.use(http.post('http://localhost/api/v1/auth/login', ({ request }) => {
      return request.json().then((input: unknown) => {
        const credentials = input as { registration: string; password: string }
        return credentials.registration === registration && credentials.password === password
          ? HttpResponse.json({
              userId: registration === '100001' ? 'unit-001' : 'ditel-001',
              name: registration === '100001' ? 'Ana Souza' : 'Carlos Lima',
              registration,
              ...expected,
            })
          : HttpResponse.json({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas.' }, { status: 401 })
      })
    }))

    await expect(authApi.signIn(registration, password)).resolves.toMatchObject(expected)
  })

  it('rejects a blocked user through the same generic authentication response', async () => {
    server.use(http.post('http://localhost/api/v1/auth/login', () => HttpResponse.json(
      { code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas.' },
      { status: 401 },
    )))

    const result = await authApi.signIn('999998', 'senha-bloqueada')

    expect(result).toBeNull()
  })

  it('uses the default MSW login contract for the DITEL fixture user', async () => {
    await expect(authApi.signIn('200001', 'sigat-ditel')).resolves.toMatchObject({
      role: 'ditel_admin',
      unit: null,
    })
  })

  it('uses the default MSW login contract for the Unit fixture user', async () => {
    await expect(authApi.signIn('100001', 'sigat-unit')).resolves.toMatchObject({
      role: 'unit_user',
      unit: { id: 'unit-centro' },
    })
  })

  it('issues a session cookie bound to the authenticated fixture context', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    try {
      await authApi.signIn('100001', 'sigat-unit')
      const unitResponse = await fetchSpy.mock.results[0].value as Response
      const unitCookie = unitResponse.headers.get('set-cookie')

      await authApi.signIn('200001', 'sigat-ditel')
      const ditelResponse = await fetchSpy.mock.results[1].value as Response
      const ditelCookie = ditelResponse.headers.get('set-cookie')

      expect(unitCookie).toContain('sigat_session=')
      expect(ditelCookie).toContain('sigat_session=')
      expect(unitCookie).not.toBe(ditelCookie)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('uses the default MSW login contract for the blocked fixture user', async () => {
    await expect(authApi.signIn('999998', 'senha-bloqueada')).resolves.toBeNull()
  })

  it('restores the current session from the server', async () => {
    server.use(http.get('http://localhost/api/v1/session', ({ request }) => {
      expect(request.credentials).toBe('include')
      return HttpResponse.json({
        userId: 'ditel-001',
        name: 'Carlos Lima',
        registration: '200001',
        role: 'ditel_admin',
        unit: null,
      })
    }))

    await expect(authApi.restore()).resolves.toEqual({
      userId: 'ditel-001',
      name: 'Carlos Lima',
      registration: '200001',
      role: 'ditel_admin',
      unit: null,
    })
  })

  it('revokes the server session on logout', async () => {
    server.use(http.post('http://localhost/api/v1/auth/logout', ({ request }) => {
      expect(request.credentials).toBe('include')
      return new HttpResponse(null, { status: 204 })
    }))

    await expect(authApi.signOut()).resolves.toBeUndefined()
  })

  it('changes the required password through the authenticated API without sending confirmation or hashes', async () => {
    server.use(http.post('http://localhost/api/v1/auth/password-change', async ({ request }) => {
      expect(request.credentials).toBe('include')
      expect(request.headers.get('content-type')).toContain('application/json')
      await expect(request.json()).resolves.toEqual({ newPassword: 'nova-senha-segura' })
      return HttpResponse.json({
        userId: 'ditel-001',
        name: 'Carlos Lima',
        registration: '200001',
        role: 'ditel_admin',
        unit: null,
      })
    }))

    await expect(authApi.changePassword('nova-senha-segura')).resolves.toEqual({
      userId: 'ditel-001',
      name: 'Carlos Lima',
      registration: '200001',
      role: 'ditel_admin',
      unit: null,
    })
  })
})
