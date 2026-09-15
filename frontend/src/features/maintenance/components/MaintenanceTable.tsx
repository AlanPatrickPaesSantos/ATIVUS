import type { MaintenanceItem, MaintenanceStatus } from '../api/maintenanceApi'

export const maintenanceStatusLabels: Record<MaintenanceStatus, string> = {
  open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada',
}

export function MaintenanceTable({ items, onSelect, actionLabel }: { items: MaintenanceItem[]; onSelect: (item: MaintenanceItem) => void; actionLabel?: string }) {
  if (!items.length) {
    return <p className="maintenance-table__empty">Nenhuma manutenção encontrada.</p>
  }
  return <div className="maintenance-table" role="table" aria-label="Manutenções">
    <div className="maintenance-table__header" role="row">
      <span role="columnheader">Equipamento</span>
      <span role="columnheader" className="maintenance-table__desc">Descrição</span>
      <span role="columnheader" className="maintenance-table__type">Tipo</span>
      <span role="columnheader" className="maintenance-table__status">Situação</span>
      {actionLabel ? <span role="columnheader">Ações</span> : null}
    </div>
    {items.map((item) => (
      <div className="maintenance-table__row" role="row" key={item.id}>
        <button type="button" className="maintenance-table__main" role="cell" onClick={() => onSelect(item)}>
          <strong>{item.equipment.patrimony}</strong><small>{item.equipment.type} · {item.equipment.brand} {item.equipment.model}</small>
        </button>
        <span role="cell" className="maintenance-table__desc">{item.description}</span>
        <span role="cell" className="maintenance-table__type">{item.type === 'corrective' ? 'Corretiva' : 'Preventiva'}</span>
        <span role="cell" className="maintenance-table__status">{maintenanceStatusLabels[item.status]}</span>
        {actionLabel ? <span role="cell"><button type="button" className="button-link" onClick={() => onSelect(item)}>{actionLabel}</button></span> : null}
      </div>
    ))}
  </div>
}