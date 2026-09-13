import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type DataTableColumn } from './DataTable'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from '../feedback/EmptyState'
import { ErrorState } from '../feedback/ErrorState'
import { LoadingState } from '../feedback/LoadingState'
import { Toast } from '../feedback/Toast'

type RecordItem = {
  id: string
  name: string
  state: string
}

const columns: DataTableColumn<RecordItem>[] = [
  { id: 'name', header: 'Nome', cell: (item) => item.name },
  { id: 'state', header: 'Situação', cell: (item) => item.state },
]

const records: RecordItem[] = [{ id: 'a-1', name: 'Registro alfa', state: 'Ativo' }]

test('renders semantic headers and activates an interactive row with Enter or Space', async () => {
  const user = userEvent.setup()
  const onRowClick = vi.fn()

  render(<DataTable columns={columns} data={records} rowKey={(item) => item.id} onRowClick={onRowClick} />)

  expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Situação' })).toBeInTheDocument()

  const row = screen.getByRole('row', { name: /registro alfa ativo/i })
  expect(row).toHaveAttribute('tabindex', '0')
  row.focus()
  await user.keyboard('{Enter}')
  await user.keyboard(' ')

  expect(onRowClick).toHaveBeenCalledTimes(2)
  expect(onRowClick).toHaveBeenNthCalledWith(1, records[0])
})

test('renders explicit loading, empty, and error content instead of data rows', () => {
  const { rerender } = render(
    <DataTable columns={columns} data={records} rowKey={(item) => item.id} loading={<p>Carregando registros</p>} />,
  )
  expect(screen.getByText('Carregando registros')).toBeInTheDocument()
  expect(screen.queryByText('Registro alfa')).not.toBeInTheDocument()

  rerender(<DataTable columns={columns} data={[]} rowKey={(item) => item.id} empty={<p>Nenhum registro encontrado</p>} />)
  expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument()

  rerender(<DataTable columns={columns} data={records} rowKey={(item) => item.id} error={<p>Não foi possível carregar</p>} />)
  expect(screen.getByText('Não foi possível carregar')).toBeInTheDocument()
})

test('keeps status meaning in text even when its visual status is unknown', () => {
  render(<StatusBadge status="unmapped" label="Em análise" />)

  expect(screen.getByText('Em análise')).toBeInTheDocument()
})

test('provides actionable and readable feedback states', async () => {
  const user = userEvent.setup()
  const onAction = vi.fn()
  const onRetry = vi.fn()

  render(
    <>
      <LoadingState label="Carregando dados" />
      <ErrorState message="Falha ao carregar" onRetry={onRetry} details="Código 503" />
      <EmptyState title="Sem dados" description="Escolha outro filtro" actionLabel="Limpar filtros" onAction={onAction} />
      <Toast tone="success">Alterações salvas</Toast>
    </>,
  )

  expect(screen.getAllByRole('status')[0]).toHaveTextContent('Carregando dados')
  expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar')
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(onRetry).toHaveBeenCalledOnce()
  expect(onAction).toHaveBeenCalledOnce()
  expect(screen.getAllByRole('status')[1]).toHaveTextContent('Alterações salvas')
})
