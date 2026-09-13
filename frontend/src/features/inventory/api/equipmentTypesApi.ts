import { httpClient } from '../../../shared/api/httpClient'

export type EquipmentTypeItem = {
  id: string
  name: string
  description: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type EquipmentTypeInput = {
  name: string
  description?: string
  active?: boolean
}

export function getEquipmentTypes(includeInactive = false) {
  const query = includeInactive ? '?includeInactive=true' : ''
  return httpClient<{ items: EquipmentTypeItem[] }>(`/equipment-types${query}`)
}

export function createEquipmentType(input: EquipmentTypeInput) {
  return httpClient<EquipmentTypeItem>('/equipment-types', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function updateEquipmentType(id: string, input: Partial<EquipmentTypeInput>) {
  return httpClient<EquipmentTypeItem>(`/equipment-types/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function deactivateEquipmentType(id: string) {
  return httpClient<EquipmentTypeItem>(`/equipment-types/${encodeURIComponent(id)}`, { method: 'DELETE' })
}