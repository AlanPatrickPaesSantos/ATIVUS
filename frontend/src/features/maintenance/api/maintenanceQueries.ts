import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSession } from '../../../shared/auth/session'
import type { SessionContext } from '../../../shared/auth/types'
import { createMaintenance, getMaintenance, updateMaintenance, type MaintenanceCreateRequest, type MaintenanceItem, type MaintenanceQuery, type MaintenanceUpdateRequest } from './maintenanceApi'

export const maintenanceQueryKeys = {
  all: (session: SessionContext | null) => ['maintenance', {
    userId: session?.userId ?? null,
    unitId: session?.unit?.id ?? null,
    role: session?.role ?? null,
  }] as const,
  list: (query: MaintenanceQuery, session: SessionContext | null) => [...maintenanceQueryKeys.all(session), { status: query.status ?? null, equipmentType: query.equipmentType ?? null }] as const,
}

export function maintenanceQueryOptions(query: MaintenanceQuery = {}) {
  const session = getSession()
  return queryOptions({
    queryKey: maintenanceQueryKeys.list(query, session),
    queryFn: () => getMaintenance(query),
  })
}

export function useMaintenanceQuery(query: MaintenanceQuery = {}) {
  return useQuery(maintenanceQueryOptions(query))
}

export function useCreateMaintenance() {
  const queryClient = useQueryClient()
  const session = getSession()
  return useMutation({
    mutationFn: (input: MaintenanceCreateRequest) => createMaintenance(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: maintenanceQueryKeys.all(session) })
    },
  })
}

export function useUpdateMaintenance() {
  const queryClient = useQueryClient()
  const session = getSession()
  return useMutation({
    mutationFn: ({ maintenanceId, input }: { maintenanceId: string; input: MaintenanceUpdateRequest }) => updateMaintenance(maintenanceId, input),
    onSuccess: (updated: MaintenanceItem) => {
      void queryClient.invalidateQueries({ queryKey: maintenanceQueryKeys.all(session) })
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['equipment'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      return updated
    },
  })
}