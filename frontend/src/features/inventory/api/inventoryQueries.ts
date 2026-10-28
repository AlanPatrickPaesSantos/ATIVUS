import { queryOptions, useQuery } from '@tanstack/react-query'
import type { InventoryQuery } from '../../../shared/api/contracts'
import { queryKeys } from '../../../shared/api/queryKeys'
import { getSession } from '../../../shared/auth/session'
import { getInventory, getInventoryFacets, type InventoryFacetQuery } from './inventoryApi'
import { getOrganizationalFilterOptions } from '../../organizationalStructure/api/organizationalStructureApi'

export const inventoryQueryKey = (query: InventoryQuery, session = getSession()) => queryKeys.inventory(query, session)

export function inventoryQueryOptions(query: InventoryQuery) {
  return queryOptions({
    queryKey: inventoryQueryKey(query),
    queryFn: () => getInventory(query),
  })
}

export function useInventoryQuery(query: InventoryQuery) {
  return useQuery(inventoryQueryOptions(query))
}

export function useInventoryFacetsQuery(filters: InventoryFacetQuery = {}) {
  return useQuery({
    queryKey: ['inventory', 'facets', getSession()?.userId ?? null, getSession()?.role ?? null, getSession()?.unit?.id ?? null, filters],
    queryFn: () => getInventoryFacets(filters),
    staleTime: 5 * 60 * 1000,
  })
}

export function useOrganizationalFilterOptionsQuery() {
  return useQuery({
    queryKey: ['organizational-structure', 'filter-options', getSession()?.userId ?? null, getSession()?.role ?? null, getSession()?.unit?.id ?? null],
    queryFn: getOrganizationalFilterOptions,
    staleTime: 5 * 60 * 1000,
  })
}
