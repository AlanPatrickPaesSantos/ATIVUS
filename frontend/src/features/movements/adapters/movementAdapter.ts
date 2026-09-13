import type { MovementApiItem } from '../api/movementsApi'

export type VisualMovement = { id: string; type: 'transferencia'; title: string; equipment: string; origin: string; destination: string; date: string; responsible: string; unitId: string }

export function adaptMovement(item: MovementApiItem): VisualMovement {
  return { id: item.id, type: 'transferencia', title: 'Transferência entre unidades', equipment: item.equipmentId, origin: item.origin.name, destination: item.destination.name, date: new Date(item.createdAt).toLocaleString('pt-BR'), responsible: item.requestedBy, unitId: item.origin.id }
}
