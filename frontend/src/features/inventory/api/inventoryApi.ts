import { httpClient } from '../../../shared/api/httpClient'
import { ApiError } from '../../../shared/api/errors'
import type { EquipmentDetails, InventoryQuery, InventoryResponse } from '../../../shared/api/contracts'
export type CreateEquipmentInput = { patrimony: string; section: string; type: string; model: string; serialNumber?: string; brand: string; hasWarranty: string; warrantyDate?: string; situation: string; location: string; observations?: string; category?: string }

export function getInventory(query: InventoryQuery) {
  const parameters = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) })
  if (query.search) parameters.set('search', query.search)
  if (query.type) parameters.set('type', query.type)
  if (query.model) parameters.set('model', query.model)
  if (query.situation) parameters.set('situation', query.situation)
  if (query.unitId) parameters.set('unitId', query.unitId)
  return httpClient<InventoryResponse>(`/inventory?${parameters.toString()}`)
}

export function getEquipmentDetails(id: string, signal?: AbortSignal) {
  if (!id.trim()) return Promise.reject(new ApiError(400, { code: 'INVALID_EQUIPMENT_ID', message: 'Identificador de equipamento inválido.' }))
  return httpClient<EquipmentDetails>(`/inventory/${encodeURIComponent(id)}`, { signal })
}

export function updateEquipmentSituation(id: string, situation: EquipmentDetails['situation'], updatedAt: string) {
  if (!id.trim()) return Promise.reject(new ApiError(400, { code: 'INVALID_EQUIPMENT_ID', message: 'Identificador de equipamento inválido.' }))
  return httpClient<Pick<EquipmentDetails, 'id' | 'patrimony' | 'situation' | 'unitName' | 'updatedAt' | 'updatedBy'>>(`/inventory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ situation, updatedAt }),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function createEquipment(input: CreateEquipmentInput, attachments: File[] = []) {
  const body = new FormData()
  Object.entries(input).forEach(([key, value]) => { if (value) body.append(key, value) })
  attachments.forEach((file) => body.append('attachments', file))
  return httpClient<EquipmentDetails>('/inventory', { method: 'POST', body })
}
