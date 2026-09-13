import { httpClient } from '../../../shared/api/httpClient'

export type MaintenanceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
export type MaintenanceEquipment = { id: string; patrimony: string; type: string; model: string; brand: string }
export type MaintenanceItem = { id: string; equipment: MaintenanceEquipment; unit: { id: string; name: string; acronym: string }; status: MaintenanceStatus; type: string; description: string; call?: { id: string; protocol: string; subject: string }; diagnosis?: string; service?: string; technicalResponsible?: string; completedAt?: string; observations?: string; openedAt: string; updatedAt: string }
export type MaintenanceResponse = { items: MaintenanceItem[] }
export type MaintenanceQuery = { status?: MaintenanceStatus; equipmentType?: string }
export type MaintenanceCreateRequest = { equipmentId: string; description: string; status: MaintenanceStatus; type: string; callId?: string }
export type MaintenanceUpdateRequest = { status: MaintenanceStatus; updatedAt: string; diagnosis?: string; service?: string; technicalResponsible?: string; completedAt?: string; observations?: string }

export function getMaintenance(query: MaintenanceQuery = {}) {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.equipmentType) params.set('equipmentType', query.equipmentType)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return httpClient<MaintenanceResponse>(`/maintenance${suffix}`)
}

export function createMaintenance(input: MaintenanceCreateRequest) {
  const body = { equipmentId: input.equipmentId, description: input.description, status: input.status, type: input.type, ...(input.callId ? { callId: input.callId } : {}) }
  return httpClient<MaintenanceItem>('/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

export function updateMaintenance(maintenanceId: string, input: MaintenanceUpdateRequest) {
  const body = { status: input.status, updatedAt: input.updatedAt, ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}), ...(input.service !== undefined ? { service: input.service } : {}), ...(input.technicalResponsible !== undefined ? { technicalResponsible: input.technicalResponsible } : {}), ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}), ...(input.observations !== undefined ? { observations: input.observations } : {}) }
  return httpClient<MaintenanceItem>(`/maintenance/${encodeURIComponent(maintenanceId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
