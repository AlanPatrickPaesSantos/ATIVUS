import { ApiError, NetworkError, RequestCancelledError, RequestTimeoutError, UnauthorizedError, type ApiErrorPayload } from './errors'

export const DEFAULT_HTTP_TIMEOUT_MS = 15_000

export type HttpClientOptions = {
  timeoutMs?: number
}

function configuredTimeoutMs(): number {
  const configured = Number(import.meta.env.VITE_HTTP_TIMEOUT_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_HTTP_TIMEOUT_MS
}

function apiUrl(path: string) {
  const baseUrl = import.meta.env.MODE === 'test' ? '/api/v1' : (import.meta.env.VITE_API_BASE_URL ?? '/api/v1')
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function errorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const payload = await response.json() as Partial<ApiErrorPayload>
    return {
      code: payload.code ?? `HTTP_${response.status}`,
      message: payload.message ?? (response.statusText || 'Erro na comunicação com a API.'),
      details: payload.details,
    }
  } catch {
    return {
      code: `HTTP_${response.status}`,
      message: response.statusText || 'Erro na comunicação com a API.',
    }
  }
}

export async function httpClient<T>(path: string, init: RequestInit = {}, options: HttpClientOptions = {}): Promise<T> {
  const response = await fetchWithNetworkHandling(path, init, options)

  if (!response.ok) {
    const payload = await errorPayload(response)
    if (response.status === 401) throw new UnauthorizedError(payload)
    throw new ApiError(response.status, payload)
  }

  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

export async function httpDownload(path: string, init: RequestInit = {}, options: HttpClientOptions = {}): Promise<Blob> {
  const response = await fetchWithNetworkHandling(path, init, options)

  if (!response.ok) {
    const payload = await errorPayload(response)
    if (response.status === 401) throw new UnauthorizedError(payload)
    throw new ApiError(response.status, payload)
  }

  return response.blob()
}

async function fetchWithNetworkHandling(path: string, init: RequestInit, options: HttpClientOptions = {}): Promise<Response> {
  const controller = new AbortController()
  const callerSignal = init.signal
  let timedOut = false

  if (callerSignal?.aborted) {
    throw new RequestCancelledError()
  }

  const abortFromCaller = () => controller.abort(callerSignal?.reason)
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? configuredTimeoutMs())

  try {
    return await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    })
  } catch (error) {
    if (timedOut) {
      throw new RequestTimeoutError()
    }
    if (callerSignal?.aborted || isAbortError(error)) {
      throw new RequestCancelledError()
    }
    throw new NetworkError()
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
