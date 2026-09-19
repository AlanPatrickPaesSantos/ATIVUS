import type { SituationCount } from '../api/dashboardApi'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'

type SituationDistributionChartProps = {
  situations: SituationCount[]
  total: number
}

const situationColors: Record<string, string> = {
  active: 'var(--sigat-success, #22c55e)',
  maintenance: 'var(--sigat-warning, #f59e0b)',
  attention: 'var(--sigat-danger, #ef4444)',
  inactive: 'var(--sigat-muted, #64748b)',
  lost: 'var(--sigat-danger, #ef4444)',
  written_off: 'var(--sigat-muted, #94a3b8)',
}

export function SituationDistributionChart({ situations, total }: SituationDistributionChartProps) {
  if (!situations || situations.length === 0 || total === 0) {
    return (
      <div className="situation-distribution-chart" data-testid="situation-distribution-chart">
        <h2>Distribuição do parque</h2>
        <EmptyState title="Nenhuma situação disponível" description="Não há equipamentos cadastrados para calcular a distribuição." />
      </div>
    )
  }

  return (
    <div className="situation-distribution-chart" data-testid="situation-distribution-chart">
      <h2>Distribuição do parque</h2>
      <p className="chart-subtitle">Proporção dos equipamentos por situação atual.</p>
      
      <div className="stacked-bar" role="figure" aria-label="Gráfico de barra empilhada da distribuição do parque">
        {situations.map((item) => {
          const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0
          const backgroundColor = situationColors[item.situation] || 'var(--sigat-border)'
          if (item.count === 0) return null
          return (
            <div
              key={item.situation}
              className="stacked-bar__segment"
              style={{ width: `${percentage}%`, backgroundColor }}
              title={`${item.label}: ${item.count} (${percentage}%)`}
            />
          )
        })}
      </div>

      <ul className="distribution-legend">
        {situations.map((item) => {
          const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0
          return (
            <li key={item.situation} className="distribution-legend__item">
              <span className="legend-color" style={{ backgroundColor: situationColors[item.situation] }} />
              <div className="legend-info">
                <span className="legend-label">{item.label}</span>
                <strong className="legend-value">{item.count} ({percentage}%)</strong>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
