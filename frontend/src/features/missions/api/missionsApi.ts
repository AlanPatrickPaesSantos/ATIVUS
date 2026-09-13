import { httpClient } from '../../../shared/api/httpClient'

export const missionStatusLabels = {
  assigned: 'Atribuída',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
} as const

export const missionTypeLabels = {
  maintenance: 'Manutenção',
  installation: 'Instalação',
  inspection: 'Inspeção',
  training: 'Treinamento',
  other: 'Outra',
} as const

export type MissionStatus = keyof typeof missionStatusLabels
export type MissionType = keyof typeof missionTypeLabels
export type MissionPriority = 'low' | 'medium' | 'high' | 'critical'

export type MissionItem = {
  id: string
  title: string
  description: string
  type: MissionType
  status: MissionStatus
  unit: { id: string; name: string; acronym?: string }
  equipment: Array<{ id: string; patrimony: string; type: string; model: string; brand: string }>
  assignedBy: { id: string; name: string; registration: string }
  assignedTo: { id: string; name: string; registration: string }
  priority: MissionPriority
  startedAt: string | null
  completedAt: string | null
  notes: Array<{ author: string; text: string; createdAt?: string }>
  createdAt: string
  updatedAt: string
}

export type MissionInput = {
  title: string
  description: string
  type: MissionType
  priority: MissionPriority
  unit: { id: string; name: string; acronym?: string }
  equipment?: MissionItem['equipment']
}

export function getMissions(params: { unitId?: string; status?: MissionStatus } = {}) {
  const search = new URLSearchParams()
  if (params.unitId) search.set('unitId', params.unitId)
  if (params.status) search.set('status', params.status)
  const query = search.toString() ? `?${search.toString()}` : ''
  return httpClient<{ items: MissionItem[] }>(`/missions${query}`)
}

export function createMission(input: MissionInput) {
  return httpClient<MissionItem>('/missions', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function updateMission(id: string, input: { status: MissionStatus; note?: string }) {
  return httpClient<MissionItem>(`/missions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}