import { expect, it } from 'vitest'
import { adaptMovement } from './movementAdapter'

it('adapts a backend transfer without exposing API-only fields', () => {
  const result = adaptMovement({ id: 'm1', type: 'Transferência definitiva', equipmentId: 'eq1', origin: { id: 'u1', name: 'Origem', acronym: 'O' }, destination: { id: 'u2', name: 'Destino', acronym: 'D' }, requestedBy: 'user-1', status: 'Aprovada', createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z' })
  expect(result).toMatchObject({ id: 'm1', type: 'transferencia', title: 'Transferência entre unidades', equipment: 'eq1', origin: 'Origem', destination: 'Destino', responsible: 'user-1', unitId: 'u1' })
})
