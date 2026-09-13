import type { EquipmentDetails } from '../../../shared/api/contracts'
import { Tabs, type TabItem } from '../../../shared/ui/overlays/Tabs'

type EquipmentDetailTabsProps = { equipment: EquipmentDetails; value: string; onChange: (value: string) => void }

function formatDate(value?: string) {
  if (!value) return 'Não informado'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

const situationLabels: Record<EquipmentDetails['situation'], string> = {
  active: 'Ativo',
  maintenance: 'Em manutenção',
  written_off: 'Baixado',
  lost: 'Perdido',
  inactive: 'Inativo',
}

export function EquipmentDetailTabs({ equipment, value, onChange }: EquipmentDetailTabsProps) {
  const allocationDate = formatDate(equipment.allocation.allocatedAt)
  const items: TabItem[] = [
    { id: 'summary', label: 'Resumo', content: <div className="equipment-summary">
      <section><h3>Identificação</h3><dl><div><dt>Patrimônio</dt><dd>{equipment.patrimony}</dd></div><div><dt>Nº de série</dt><dd>{equipment.serialNumber ?? 'Não informado'}</dd></div><div><dt>Tipo</dt><dd>{equipment.type}</dd></div><div><dt>Marca</dt><dd>{equipment.brand}</dd></div><div><dt>Modelo</dt><dd>{equipment.model}</dd></div><div><dt>Categoria</dt><dd>{equipment.category || 'Não informada'}</dd></div></dl></section>
      <section><h3>Situação e garantia</h3><dl><div><dt>Situação atual</dt><dd>{situationLabels[equipment.situation]}</dd></div><div><dt>Garantia</dt><dd>{equipment.warranty ?? 'Não informada'}</dd></div><div><dt>Observações</dt><dd>{equipment.observations ?? 'Não informadas'}</dd></div></dl></section>
      <section><h3>Unidade e alocação</h3><dl><div><dt>Unidade responsável</dt><dd>{equipment.unitName}</dd></div><div><dt>Localização atual</dt><dd>{equipment.allocation.location}</dd></div><div><dt>Responsável pela guarda</dt><dd>{equipment.allocation.responsibleUser ?? 'Não informado'}</dd></div><div><dt>Data da alocação</dt><dd>{allocationDate}</dd></div></dl></section>
      <section><h3>Registro</h3><dl><div><dt>Data de cadastro</dt><dd>{formatDate(equipment.createdAt)}</dd></div><div><dt>Usuário responsável</dt><dd>{equipment.createdBy ?? 'Não informado'}</dd></div><div><dt>Última atualização</dt><dd>{formatDate(equipment.updatedAt)}</dd></div><div><dt>Atualizado por</dt><dd>{equipment.updatedBy ?? 'Não informado'}</dd></div></dl></section>
    </div> },
    { id: 'technical', label: 'Dados técnicos', content: <div className="equipment-tab-copy"><h3>Especificações cadastradas</h3><dl><div><dt>Número de série</dt><dd>{equipment.serialNumber ?? 'Não informado'}</dd></div><div><dt>Categoria</dt><dd>{equipment.category || 'Não informada'}</dd></div><div><dt>Garantia</dt><dd>{equipment.warranty ?? 'Não informada'}</dd></div></dl></div> },
    { id: 'maintenance', label: 'Manutenção', content: <div className="equipment-tab-copy"><h3>Histórico de manutenção</h3><p>Nenhuma ordem de manutenção ativa para este equipamento.</p></div> },
    { id: 'history', label: 'Histórico', content: <div className="equipment-tab-copy"><h3>Histórico patrimonial</h3>{equipment.history.length ? <ul>{equipment.history.map((entry) => <li key={entry.id}>{entry.description} — {formatDate(entry.occurredAt)}</li>)}</ul> : <p>Sem histórico disponível</p>}</div> },
    { id: 'calls', label: 'Chamados', content: <div className="equipment-tab-copy"><h3>Chamados vinculados</h3>{equipment.linkedCalls.length ? <ul><li>Chamados vinculados: {equipment.linkedCalls.length}</li>{equipment.linkedCalls.map((call) => <li key={call.id}>{call.subject} — {call.status} — {formatDate(call.openedAt)}</li>)}</ul> : <p>Chamados vinculados: nenhum</p>}</div> },
    { id: 'documents', label: 'Documentos', content: <div className="equipment-tab-copy"><h3>Documentos vinculados</h3>{equipment.documents.length ? <ul>{equipment.documents.map((document) => <li key={document.id}><a href={document.downloadUrl}>{document.name}</a> — {document.type}</li>)}</ul> : <p>Nenhum documento disponível</p>}</div> },
  ]
  return <Tabs items={items} value={value} onChange={onChange} />
}
