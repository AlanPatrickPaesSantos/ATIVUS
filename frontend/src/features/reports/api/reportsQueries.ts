import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../../shared/api/queryKeys'
import { getSession } from '../../../shared/auth/session'
import { getInventoryReport, type InventoryReportQuery } from './reportsApi'

export function useInventoryReportQuery(query: InventoryReportQuery) {
  const session = getSession()

  return useQuery({
    queryKey: queryKeys.inventoryReport(query, session),
    queryFn: () => getInventoryReport(query),
    enabled: session !== null,
    retry: false,
  })
}
