import { Link } from 'react-router-dom'

import { DataTable, type DataTableColumn } from '../../../shared/ui/data/DataTable'
import type { OrganizationalStructureItem } from '../api/organizationalStructureApi'

function verificationLabel(status: OrganizationalStructureItem['verificationStatus']) {
  return status === 'confirmed' ? 'Confirmada' : status === 'divergent' ? 'Divergente' : 'Pendente'
}

export function OrganizationalTable({ items, loading, error, onSelect }: { items: OrganizationalStructureItem[]; loading: boolean; error?: React.ReactNode; onSelect: (item: OrganizationalStructureItem) => void }) {
  const columns: DataTableColumn<OrganizationalStructureItem>[] = [
    { id: 'organization', header: 'Organização', cell: (item) => <span><strong>{item.name}</strong><small>{item.acronym}</small></span> },
    { id: 'kind', header: 'Tipo', cell: (item) => item.kind },
    { id: 'parent', header: 'Comando superior', cell: (item) => item.parent?.acronym ?? 'Sem vínculo confirmado' },
    { id: 'status', header: 'Verificação', cell: (item) => <span className={`organizational-status organizational-status--${item.verificationStatus}`}>{verificationLabel(item.verificationStatus)}</span> },
    { id: 'equipment', header: 'Equipamentos', cell: (item) => <span>{item.equipmentCount.toLocaleString('pt-BR')}<small>{item.demonstrativeEquipmentCount ? ' demonstrativos' : ''}</small></span> },
    { id: 'actions', header: 'Ações', cell: (item) => <span className="organizational-actions"><button type="button" className="button-link" onClick={() => onSelect(item)} aria-label={`Ver detalhes de ${item.name}`}>Detalhes</button>{item.kind !== 'intermediate_command' && <><Link className="button-link" to={`/inventario?unitId=${encodeURIComponent(item.id)}`} aria-label={`Abrir inventário de ${item.name}`}>Inventário</Link><Link className="button-link" to={`/relatorios?unitId=${encodeURIComponent(item.id)}`} aria-label={`Abrir relatório de ${item.name}`}>Relatório</Link></>}</span> },
  ]
  return <div className="organizational-table-scroll"><DataTable columns={columns} data={items} rowKey={(item) => item.id} loading={loading} error={error} onRowClick={onSelect} empty={<span>Nenhuma organização encontrada</span>} /></div>
}
