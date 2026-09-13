import { ApiError, UnauthorizedError, type ApiErrorPayload } from './errors'

function apiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.MODE === 'test' ? 'http://localhost/api/v1' : '/api/v1')
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

export async function httpClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = await errorPayload(response)
    if (response.status === 401) throw new UnauthorizedError(payload)
    throw new ApiError(response.status, payload)
  }

  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

export async function httpDownload(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = await errorPayload(response)
    if (response.status === 401) throw new UnauthorizedError(payload)
    throw new ApiError(response.status, payload)
  }

  return response.blob()
}
