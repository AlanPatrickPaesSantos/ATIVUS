import type { ReactNode } from 'react'
import { EmptyState } from '../feedback/EmptyState'
import { LoadingState } from '../feedback/LoadingState'

export type DataTableColumn<T> = {
  id: string
  header: ReactNode
  cell: (item: T) => ReactNode
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  data: T[]
  rowKey: (item: T) => string
  loading?: boolean | ReactNode
  empty?: ReactNode
  error?: ReactNode
  onRowClick?: (item: T) => void
  rowClassName?: (item: T) => string | undefined
}

export function DataTable<T>({ columns, data, rowKey, loading = false, empty, error, onRowClick, rowClassName }: DataTableProps<T>) {
  const stateContent = error ?? (loading ? (loading === true ? <LoadingState /> : loading) : data.length === 0 ? (empty ?? <EmptyState />) : null)

  return (
    <div className="data-table">
      <table aria-busy={Boolean(loading)}>
        <thead>
          <tr>{columns.map((column) => <th key={column.id} scope="col">{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {stateContent ? (
            <tr><td colSpan={columns.length}>{stateContent}</td></tr>
          ) : data.map((item) => (
            <tr
              key={rowKey(item)}
              className={rowClassName?.(item)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onRowClick(item)
                }
              } : undefined}
              data-clickable={Boolean(onRowClick)}
            >
              {columns.map((column) => <td key={column.id}>{column.cell(item)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
