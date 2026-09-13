import type { EquipmentSummary } from '../../../shared/api/contracts'
import { DataTable } from '../../../shared/ui/data/DataTable'
import { StatusBadge } from '../../../shared/ui/data/StatusBadge'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'

const situationLabels: Record<EquipmentSummary['situation'], { label: string; status: string }> = {
  active: { label: 'Ativo', status: 'available' },
  maintenance: { label: 'Em manutenção', status: 'attention' },
  inactive: { label: 'Inativo', status: 'critical' },
  lost: { label: 'Extraviado', status: 'critical' },
  written_off: { label: 'Baixado', status: 'critical' },
}

type InventoryTableProps = {
  items: EquipmentSummary[]
  loading: boolean
  error: boolean
  isMobile: boolean
  onSelect: (equipment: EquipmentSummary) => void
  onRetry: () => void
  onClearFilters: () => void
  selectedId?: string
}

export function InventoryTable({ items, loading, error, isMobile, onSelect, onRetry, onClearFilters, selectedId }: InventoryTableProps) {
  const empty = <EmptyState title="Nenhum equipamento encontrado" description="Revise os filtros aplicados ou limpe a busca para consultar todo o inventário." actionLabel="Limpar filtros" onAction={onClearFilters} />
  if (isMobile && !loading && !error && items.length === 0) return empty
  if (isMobile && !loading && !error) return <div className="inventory-cards" aria-label="Equipamentos do inventário">{items.map((item) => <article key={item.id}><h2>{item.patrimony}</h2><p>{item.type} · {item.brand} {item.model}</p><p>{situationLabels[item.situation].label} · {item.location}</p><button className="button-link" type="button" aria-label={`Ver detalhes de ${item.patrimony}`} onClick={() => onSelect(item)}>Ver detalhes</button></article>)}</div>
  return <DataTable
    columns={[
      { id: 'patrimony', header: 'Patrimônio', cell: (item) => <span className="inventory-asset"><i className={`inventory-asset__dot inventory-asset__dot--${situationLabels[item.situation].status}`} /><span><strong>{item.patrimony}</strong><small>{item.type} · {item.brand} {item.model}</small></span></span> },
      { id: 'type', header: 'Tipo', cell: (item) => item.type },
      { id: 'model', header: 'Marca / modelo', cell: (item) => `${item.brand} ${item.model}` },
      { id: 'situation', header: 'Situação', cell: (item) => <StatusBadge {...situationLabels[item.situation]} /> },
      { id: 'location', header: 'Localização / responsável', cell: (item) => item.location },
      { id: 'updated', header: 'Última atualização', cell: () => 'Hoje, 11:24' },
      { id: 'actions', header: '', cell: (item) => <button className="inventory-row-action" type="button" aria-label={`Ver detalhes de ${item.patrimony}`} onClick={(event) => { event.stopPropagation(); onSelect(item) }}>•••</button> },
    ]}
    data={items}
    rowKey={(item) => item.id}
    loading={loading}
    empty={empty}
    error={error ? <ErrorState message="Não foi possível carregar o inventário." onRetry={onRetry} /> : undefined}
    onRowClick={onSelect}
    rowClassName={(item) => item.id === selectedId ? 'is-selected' : undefined}
  />
}
