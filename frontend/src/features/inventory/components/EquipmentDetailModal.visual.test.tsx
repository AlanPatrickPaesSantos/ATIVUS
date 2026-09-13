import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { EquipmentDetailModal } from './EquipmentDetailModal'
import { getEquipmentDetails } from '../api/inventoryApi'

vi.mock('../api/inventoryApi', () => ({ getEquipmentDetails: vi.fn() }))

test('presents the equipment detail as a command-console layout', async () => {
  vi.mocked(getEquipmentDetails).mockResolvedValue({
    id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola',
    situation: 'active', location: 'Sala de Comunicações', unitName: '3º BPM', category: 'Comunicação',
    serialNumber: 'APX2K26F7Q01234', warranty: 'Até 12/03/2027', allocation: { location: 'Sala de Comunicações', allocatedAt: '2026-02-18' },
    history: [], linkedCalls: [{ id: 'CH-2026-01572', subject: 'Falha intermitente no áudio', status: 'Aberto', openedAt: '2026-05-10' }],
    documents: [{ id: 'doc-1', name: 'Manual_APX2000.pdf', type: 'application/pdf', size: 1024, uploadedAt: '2026-08-20T10:00:00.000Z', status: 'active', downloadUrl: '/api/v1/attachments/doc-1/download' }],
  })

  render(<EquipmentDetailModal equipmentId="eq-001" open onClose={vi.fn()} onOpenCall={vi.fn()} />)

  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Equipamento PAT-2026-004821' })).toBeInTheDocument())
  expect(screen.getByTestId('equipment-detail-console')).toHaveAttribute('data-visual-variant', 'command-console')
  expect(screen.getByTestId('equipment-detail-body')).toContainElement(screen.getByTestId('equipment-operations-panel'))
  expect(screen.getByTestId('equipment-operations-panel')).toBeInTheDocument()
  expect(screen.getByTestId('equipment-action-bar')).toHaveAttribute('data-density', 'command-actions')
  expect(screen.getByTestId('equipment-document-row-doc-1')).toHaveAttribute('data-row', 'operational-file')
  expect(screen.getByRole('button', { name: 'Editar equipamento' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Abrir chamado' })).toBeInTheDocument()
})
