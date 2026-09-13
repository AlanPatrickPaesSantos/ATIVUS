import { queryOptions, useQuery } from '@tanstack/react-query'
import type { InventoryQuery } from '../../../shared/api/contracts'
import { queryKeys } from '../../../shared/api/queryKeys'
import { getSession } from '../../../shared/auth/session'
import { getInventory } from './inventoryApi'

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
