import { httpClient } from '../../../shared/api/httpClient'
import type { PendingOperationsQuery, PendingOperationsResponse } from '../../../shared/api/contracts'

export function getPendingOperations(query: PendingOperationsQuery = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value))
  const suffix = params.toString()
  return httpClient<PendingOperationsResponse>(`/pending-operations${suffix ? `?${suffix}` : ''}`, { signal })
}
