import { useQuery } from '@tanstack/react-query'
import { getSession } from '../../../shared/auth/session'
import { queryKeys } from '../../../shared/api/queryKeys'
import { getDashboard } from './dashboardApi'

export function useDashboardQuery() {
  const session = getSession()
  return useQuery({
    queryKey: queryKeys.dashboard(session),
    queryFn: getDashboard,
    enabled: session !== null,
  })
}
