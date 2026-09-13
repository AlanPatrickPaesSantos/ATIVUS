import { queryOptions, useQuery } from '@tanstack/react-query'
import { getAuditEvents, type AuditEventFilters } from './auditApi'

export function auditQueryKeys(filters: AuditEventFilters = {}, page = 1, pageSize = 20) {
  return ['audit-events', filters, page, pageSize] as const
}

export function auditQueryOptions(filters: AuditEventFilters = {}, page = 1, pageSize = 20) {
  return queryOptions({
    queryKey: auditQueryKeys(filters, page, pageSize),
    queryFn: () => getAuditEvents(filters, page, pageSize),
    staleTime: 30_000,
  })
}

export function useAuditEventsQuery(filters: AuditEventFilters = {}, page = 1, pageSize = 20) {
  return useQuery(auditQueryOptions(filters, page, pageSize))
}