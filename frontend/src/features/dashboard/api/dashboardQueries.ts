import { useQuery } from '@tanstack/react-query'
import { getSession } from '../../../shared/auth/session'
import { queryKeys } from '../../../shared/api/queryKeys'
import { getDashboard } from './dashboardApi'
import type { DashboardFilters } from '../../../shared/api/contracts'

export function useDashboardQuery(filters: DashboardFilters = {}) {
  const session = getSession()
  return useQuery({
    queryKey: [...queryKeys.dashboard(session), filters],
    queryFn: () => getDashboard(filters),
    enabled: session !== null,
  })
}
