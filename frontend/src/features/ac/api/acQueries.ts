import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAcMaterial, getAcMaterials, getAcPatrimonialReport, getAcTransfer, getAcTransfers } from './acApi'
import type { AcMaterialQuery, AcPatrimonialReportQuery } from '../../../shared/api/contracts'
import { queryKeys } from '../../../shared/api/queryKeys'

export const acQueryKeys = queryKeys.ac

export function useAcMaterialsQuery(query: AcMaterialQuery) {
  return useQuery(queryOptions({ queryKey: acQueryKeys.materials(query), queryFn: () => getAcMaterials(query) }))
}

export function useAcMaterialQuery(id: string | null) {
  return useQuery({ queryKey: acQueryKeys.material(id ?? ''), queryFn: () => getAcMaterial(id ?? ''), enabled: Boolean(id) })
}

export function useAcTransfersQuery(query: { page: number; pageSize: number }) {
  return useQuery(queryOptions({ queryKey: acQueryKeys.transfers(query), queryFn: () => getAcTransfers(query) }))
}

export function useAcTransferQuery(id: string | null) {
  return useQuery({ queryKey: acQueryKeys.transfer(id ?? ''), queryFn: () => getAcTransfer(id ?? ''), enabled: Boolean(id) })
}

export function useAcPatrimonialReportQuery(query: AcPatrimonialReportQuery) {
  return useQuery(queryOptions({ queryKey: acQueryKeys.reports(query), queryFn: () => getAcPatrimonialReport(query) }))
}

export function useInvalidateAcQueries() {
  const queryClient = useQueryClient()
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: acQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['reports'] }),
  ])
}
