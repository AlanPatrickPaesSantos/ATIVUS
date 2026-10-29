import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AcReturn } from '../../../shared/api/contracts'
import type { MovementApiItem } from '../api/movementsApi'
import { MovementOperationsSummary } from './MovementOperationsSummary'

const movement = (status: MovementApiItem['status']): MovementApiItem => ({
  id: status,
  type: 'Transferência definitiva',
  equipmentId: 'equipment-1',
  equipment: { patrimony: 'RP-1', type: 'Rádio', model: 'X' },
  origin: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' },
  destination: { id: 'unit-2', name: 'Unidade 2', acronym: 'U2' },
  requestedBy: 'user-1',
  status,
  divergences: [],
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
})

const acReturn = (status: AcReturn['status']): AcReturn => ({
  id: `return-${status}`,
  equipmentId: 'equipment-2',
  origin: { id: 'unit-1', name: 'Unidade 1', acronym: 'U1' },
  requestedBy: 'user-1',
  status,
  equipment: { patrimony: 'RP-2', type: 'Rádio', model: 'Y', brand: 'Marca', situation: 'active', unit: null, custody: null, equipmentUpdatedAt: '2026-10-28T10:00:00.000Z', equipmentVersion: 0 },
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
})

describe('MovementOperationsSummary', () => {
  it('counts operational states from movements and AC returns', () => {
    render(<MovementOperationsSummary movements={[movement('Pendente'), movement('Divergência'), movement('Recebida')]} acReturns={[acReturn('Aguardando recebimento'), acReturn('Cancelada')]} loading={false} error={null} />)

    expect(screen.getByText('Solicitações pendentes')).toBeInTheDocument()
    expect(screen.getByTestId('movement-summary-pending')).toHaveTextContent('1')
    expect(screen.getByTestId('movement-summary-receiving')).toHaveTextContent('1')
    expect(screen.getByTestId('movement-summary-divergences')).toHaveTextContent('1')
    expect(screen.getByTestId('movement-summary-completed')).toHaveTextContent('2')
  })

  it('does not display totals while the AC data is loading', () => {
    render(<MovementOperationsSummary movements={[]} acReturns={[]} loading error={null} />)

    expect(screen.getByRole('status')).toHaveTextContent('Carregando')
    expect(screen.queryByTestId('movement-summary-pending')).not.toBeInTheDocument()
  })
})
