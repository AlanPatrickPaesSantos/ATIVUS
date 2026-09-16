import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../../shared/api/queryKeys'
import { getSession } from '../../../shared/auth/session'
import { getCallsSummaryReport, getGeneralReport, getInventoryReport, getMovementsSummaryReport, type InventoryReportQuery } from './reportsApi'

export function useInventoryReportQuery(query: InventoryReportQuery) {
  const session = getSession()

  return useQuery({
    queryKey: queryKeys.inventoryReport(query, session),
    queryFn: () => getInventoryReport(query),
    enabled: session !== null,
    retry: false,
  })
}

export function useCallsSummaryReportQuery(query: InventoryReportQuery) {
  const session = getSession()

  return useQuery({
    queryKey: queryKeys.callsSummaryReport(query, session),
    queryFn: () => getCallsSummaryReport(query),
    enabled: session !== null,
    retry: false,
  })
}

export function useMovementsSummaryReportQuery(query: InventoryReportQuery) {
  const session = getSession()

  return useQuery({
    queryKey: queryKeys.movementsSummaryReport(query, session),
    queryFn: () => getMovementsSummaryReport(query),
    enabled: session !== null,
    retry: false,
  })
}

export function useGeneralReportQuery(query: InventoryReportQuery) {
  const session = getSession()

  return useQuery({
    queryKey: queryKeys.generalReport(query, session),
    queryFn: () => getGeneralReport(query),
    enabled: session !== null,
    retry: false,
  })
}