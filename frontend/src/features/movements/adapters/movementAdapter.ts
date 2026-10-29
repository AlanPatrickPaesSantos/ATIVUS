import type { MovementApiItem } from '../api/movementsApi'
import type { MovementKind } from '../../../shared/fixtures/moduleFixtures'

export type VisualMovement = { id: string; type: MovementKind; title: string; equipment: string; origin: string; destination: string; date: string; occurredAt?: string; responsible: string; unitId: string; destinationId?: string; status?: MovementApiItem['status'] }

export function adaptMovement(item: MovementApiItem): VisualMovement {
  return { id: item.id, type: 'transferencia', title: 'Transferência entre unidades', equipment: item.equipment?.patrimony ?? item.equipmentId, origin: item.origin.name, destination: item.destination.name, date: new Date(item.createdAt).toLocaleString('pt-BR'), occurredAt: item.createdAt, responsible: item.requestedBy, unitId: item.origin.id, destinationId: item.destination.id, status: item.status }
}
