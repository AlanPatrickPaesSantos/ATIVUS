import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEquipmentType, deactivateEquipmentType, getEquipmentTypes, updateEquipmentType, type EquipmentTypeInput, type EquipmentTypeItem } from './equipmentTypesApi'

export const equipmentTypeQueryKeys = {
  all: ['equipment-types'] as const,
}

export function equipmentTypeQueryOptions(includeInactive = false) {
  return queryOptions({
    queryKey: [...equipmentTypeQueryKeys.all, { includeInactive }],
    queryFn: () => getEquipmentTypes(includeInactive),
  })
}

export function useEquipmentTypesQuery(includeInactive = false) {
  return useQuery(equipmentTypeQueryOptions(includeInactive))
}

function useInvalidateEquipmentTypes() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: equipmentTypeQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['inventory'] })
  }
}

export function useCreateEquipmentType() {
  const invalidate = useInvalidateEquipmentTypes()
  return useMutation({
    mutationFn: (input: EquipmentTypeInput) => createEquipmentType(input),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateEquipmentType() {
  const invalidate = useInvalidateEquipmentTypes()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EquipmentTypeInput> }) => updateEquipmentType(id, input),
    onSuccess: () => invalidate(),
  })
}

export function useDeactivateEquipmentType() {
  const invalidate = useInvalidateEquipmentTypes()
  return useMutation({
    mutationFn: (id: string) => deactivateEquipmentType(id),
    onSuccess: () => invalidate(),
  })
}

export type { EquipmentTypeItem }