import { httpClient } from '../../../shared/api/httpClient'

export type MovementApiItem = {
  id: string
  type: 'Transferência definitiva'
  equipmentId: string
  origin: { id: string; name: string; acronym: string }
  destination: { id: string; name: string; acronym: string }
  requestedBy: string
  status: 'Pendente' | 'Aprovada' | 'Rejeitada'
  decisionReason?: string | null
  createdAt: string
  updatedAt: string
}

export type MovementsResponse = { items: MovementApiItem[] }

export function getMovements() {
  return httpClient<MovementsResponse>('/movements')
}

export type MovementDecision = { status: 'Aprovada' | 'Rejeitada'; updatedAt: string; reason?: string }

export function decideMovement(id: string, decision: MovementDecision) {
  return httpClient<MovementApiItem>(`/movements/${encodeURIComponent(id)}/decision`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
  })
}

export type CreateMovementInput = { equipmentId: string; destination: { id: string; name: string; acronym: string } }

export function createMovement(input: CreateMovementInput) {
  return httpClient<MovementApiItem>('/movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
}
