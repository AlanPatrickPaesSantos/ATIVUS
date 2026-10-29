import { httpClient } from '../../../shared/api/httpClient'
import type { AcReturn, AcReturnCreateInput, AcReturnDecision, AcReturnDivergenceResolution, AcReturnReceipt, AcReturnsResponse } from '../../../shared/api/contracts'

export type MovementApiItem = {
  id: string
  type: 'Transferência definitiva'
  equipmentId: string
  equipment?: { patrimony: string; type: string; model: string }
  origin: { id: string; name: string; acronym: string }
  destination: { id: string; name: string; acronym: string }
  requestedBy: string
  status: 'Pendente' | 'Aprovada' | 'Aguardando recebimento' | 'Recebida' | 'Divergência' | 'Rejeitada' | 'Cancelada'
  cancelledBy?: string | null
  cancelledAt?: string | null
  divergences: Array<{ description: string; reportedBy: string; reportedAt: string; resolutionStatus: 'pending' | 'resolved'; resolvedBy?: string | null; resolvedAt?: string | null; resolution?: string | null }>
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
export function cancelMovement(id: string, cancellation: { updatedAt: string; reason: string }) { return httpClient<MovementApiItem>(`/movements/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cancellation) }) }

export type MovementReceipt = { status: 'Recebida' | 'Divergência'; updatedAt: string; description?: string }
export function receiveMovement(id: string, receipt: MovementReceipt) { return httpClient<MovementApiItem>(`/movements/${encodeURIComponent(id)}/receipt`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receipt) }) }
export function resolveMovementDivergence(id: string, resolution: { action: 'retomar' | 'rejeitar'; updatedAt: string; resolution: string }) { return httpClient<MovementApiItem>(`/movements/${encodeURIComponent(id)}/divergence`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resolution) }) }

export type CreateMovementInput = { equipmentId: string; destination: { id: string; name: string; acronym: string } }

export function createMovement(input: CreateMovementInput) {
  return httpClient<MovementApiItem>('/movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
}

export function getAcReturns(query: { page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  const suffix = params.toString()
  return httpClient<AcReturnsResponse>(`/ac/returns${suffix ? `?${suffix}` : ''}`)
}

export function createAcReturn(input: AcReturnCreateInput, idempotencyKey: string) {
  return httpClient<AcReturn>('/ac/returns', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) })
}

export function decideAcReturn(id: string, decision: AcReturnDecision) {
  return httpClient<AcReturn>(`/ac/returns/${encodeURIComponent(id)}/decision`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision) })
}
export function cancelAcReturn(id: string, cancellation: { updatedAt: string; reason: string }) { return httpClient<AcReturn>(`/ac/returns/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cancellation) }) }
export function receiveAcReturn(id: string, receipt: AcReturnReceipt) { return httpClient<AcReturn>(`/ac/returns/${encodeURIComponent(id)}/receipt`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receipt) }) }
export function resolveAcReturnDivergence(id: string, resolution: AcReturnDivergenceResolution) { return httpClient<AcReturn>(`/ac/returns/${encodeURIComponent(id)}/divergence`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resolution) }) }
