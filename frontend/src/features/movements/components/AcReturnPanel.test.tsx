import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionContext } from '../../../shared/auth/types'
import { AcReturnPanel } from './AcReturnPanel'

const api = vi.hoisted(() => ({
  getAcReturns: vi.fn(),
  createAcReturn: vi.fn(),
  decideAcReturn: vi.fn(),
}))
const inventory = vi.hoisted(() => ({ getInventory: vi.fn() }))
vi.mock('../api/movementsApi', () => api)
vi.mock('../../inventory/api/inventoryApi', () => inventory)

const unitSession: SessionContext = { userId: 'unit-1', name: 'Unidade', registration: '1', role: 'unit_user', unit: { id: 'unit-1', name: 'Unidade Norte', acronym: 'UN' } }
const acSession: SessionContext = { userId: 'ac-1', name: 'AC', registration: '2', role: 'ac_operator', unit: null }
const equipment = { id: 'equipment-1', patrimony: 'RP-1', type: 'Rádio', model: 'X', situation: 'active' }
const pending = { id: 'return-1', equipmentId: equipment.id, origin: unitSession.unit!, requestedBy: 'unit-1', status: 'Pendente', equipment: { ...equipment }, createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z' }

beforeEach(() => {
  vi.clearAllMocks()
  api.getAcReturns.mockResolvedValue({ items: [] })
  inventory.getInventory.mockResolvedValue({ items: [equipment] })
  api.createAcReturn.mockResolvedValue({ ...pending })
  api.decideAcReturn.mockResolvedValue({ ...pending, status: 'Aceita' })
})

describe('AcReturnPanel', () => {
  it('lets a unit request a return without changing the equipment locally', async () => {
    const user = userEvent.setup()
    render(<AcReturnPanel session={unitSession} />)
    await user.click(await screen.findByRole('button', { name: 'Solicitar devolução para a AC' }))
    await user.selectOptions(await screen.findByLabelText('Equipamento para devolução'), equipment.id)
    await user.type(await screen.findByLabelText('Justificativa da devolução'), 'Conferência patrimonial.')
    await user.click(screen.getByRole('button', { name: 'Confirmar devolução' }))
    await waitFor(() => expect(api.createAcReturn).toHaveBeenCalledWith({ equipmentId: equipment.id, reason: 'Conferência patrimonial.' }, expect.any(String)))
    expect(screen.getByRole('status')).toHaveTextContent('Devolução solicitada')
  })

  it('lets AC reject a pending return with a reason', async () => {
    const user = userEvent.setup()
    api.getAcReturns.mockResolvedValue({ items: [pending] })
    render(<AcReturnPanel session={acSession} />)
    await user.click(await screen.findByRole('button', { name: 'Analisar devolução return-1' }))
    const dialog = screen.getByRole('dialog', { name: 'Analisar devolução AC' })
    await user.type(within(dialog).getByLabelText('Justificativa da decisão'), 'Equipamento requer conferência.')
    await user.click(within(dialog).getByRole('button', { name: 'Rejeitar devolução' }))
    await waitFor(() => expect(api.decideAcReturn).toHaveBeenCalledWith('return-1', { status: 'Rejeitada', updatedAt: pending.updatedAt, reason: 'Equipamento requer conferência.' }))
  })
})
