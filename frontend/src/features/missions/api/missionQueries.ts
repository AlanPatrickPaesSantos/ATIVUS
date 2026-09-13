import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMission, getMissions, updateMission, type MissionInput, type MissionItem, type MissionStatus } from './missionsApi'

export const missionQueryKeys = {
  all: ['missions'] as const,
  list: (filters: { unitId?: string; status?: MissionStatus }) => [...missionQueryKeys.all, 'list', filters] as const,
}

export function missionQueryOptions(filters: { unitId?: string; status?: MissionStatus } = {}) {
  return queryOptions({
    queryKey: missionQueryKeys.list(filters),
    queryFn: () => getMissions(filters),
  })
}

export function useMissionsQuery(filters: { unitId?: string; status?: MissionStatus } = {}) {
  return useQuery(missionQueryOptions(filters))
}

export function useCreateMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MissionInput) => createMission(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: missionQueryKeys.all })
    },
  })
}

export function useUpdateMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { status: MissionStatus; note?: string } }) => updateMission(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: missionQueryKeys.all })
    },
  })
}

export type { MissionItem }