import type { SituationCount } from '../api/dashboardApi'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { StatusBadge } from '../../../shared/ui/data/StatusBadge'

type EquipmentSituationSummaryProps = {
  situations: SituationCount[]
}

const statusBySituation: Record<SituationCount['situation'], 'available' | 'attention' | 'critical' | 'operational'> = {
  active: 'available',
  maintenance: 'attention',
  attention: 'critical',
  inactive: 'attention',
  lost: 'critical',
  written_off: 'operational',
}

export function EquipmentSituationSummary({ situations }: EquipmentSituationSummaryProps) {
  return (
    <section aria-labelledby="equipment-situation-title" className="dashboard-panel equipment-situation-summary">
      <div>
        <h2 id="equipment-situation-title">Situação dos equipamentos</h2>
        <p>Distribuição do inventário da Unidade autenticada.</p>
      </div>
      {situations.length === 0 ? <EmptyState title="Nenhuma situação disponível" description="Não há equipamentos para resumir nesta Unidade." /> : (
        <ul>
          {situations.map((item) => (
            <li key={item.situation}>
              <StatusBadge status={statusBySituation[item.situation]} label={item.label} />
              <strong aria-label={`${item.count} equipamentos em ${item.label}`}>{item.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
