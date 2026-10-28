import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '../../../shared/api/queryKeys'
import { getOrganizationalFilterOptions, getOrganizationalIndicators, getOrganizationalNode, getOrganizationalStructure, type OrganizationalStructureQuery } from './organizationalStructureApi'

export function useOrganizationalStructureQuery(query: OrganizationalStructureQuery) {
  return useQuery({ queryKey: queryKeys.organizationalStructure(query), queryFn: () => getOrganizationalStructure(query) })
}

export function useOrganizationalNodeQuery(organizationId: string | null) {
  return useQuery({ queryKey: queryKeys.organizationalNode(organizationId), queryFn: () => getOrganizationalNode(organizationId as string), enabled: organizationId !== null })
}

export function useOrganizationalIndicatorsQuery(organizationId: string | null) {
  return useQuery({ queryKey: queryKeys.organizationalIndicators(organizationId), queryFn: () => getOrganizationalIndicators(organizationId as string), enabled: organizationId !== null })
}

export function useOrganizationalFilterOptionsQuery() {
  return useQuery({
    queryKey: queryKeys.organizationalFilterOptions,
    queryFn: getOrganizationalFilterOptions,
    staleTime: 5 * 60 * 1000,
  })
}
