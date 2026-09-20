import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import type { Activity } from '../api/dashboardApi'

type UnitEvolutionChartProps = {
  recentActivity?: Activity[]
}

function formatDate(item: Activity): string {
  const d = new Date(item.occurredAt)
  if (Number.isNaN(d.getTime())) return item.occurredAt
  return d.toLocaleDateString('pt-BR', { month: 'short', day: '2-digit' })
}

export function UnitEvolutionChart({ recentActivity = [] }: UnitEvolutionChartProps) {
  const hasActivity = Array.isArray(recentActivity) && recentActivity.length > 0

  if (!hasActivity) {
    return (
      <section className="unit-evolution-chart" aria-label="Evolução operacional">
        <h3 className="unit-evolution-chart__title">Evolução operacional</h3>
        <div className="unit-evolution-chart__empty">
          <EmptyState
            title="Nenhuma atividade recente"
            description="Não há registros de manutenção ou movimentações para mostrar a evolução."
          />
        </div>
      </section>
    )
  }

  return (
    <section className="unit-evolution-chart" aria-label="Evolução operacional">
      <h3 className="unit-evolution-chart__title">Evolução operacional</h3>
      <div className="unit-evolution-chart__content">
        <div className="unit-evolution-chart__bars" role="figure" aria-label="Barras de evolução operacional">
          {recentActivity.map((item, index) => {
            const month = formatDate(item)
            const height = `${Math.max(18, Math.min(((index + 1) / recentActivity.length) * 100, 100))}%`
            return (
              <article
                key={item.id}
                className="unit-evolution-chart__bar-item"
                aria-label={`${month}: ${item.description}`}
              >
                <div
                  className="unit-evolution-chart__bar"
                  style={{ height }}
                  title={`${month}: ${item.description}`}
                />
              </article>
            )
          })}
        </div>
        <ol className="unit-evolution-chart__timeline" aria-label="Linha do tempo operacional">
          {recentActivity.slice(0, 4).map((item) => (
            <li key={item.id}>
              <span>{formatDate(item)}</span>
              <strong>{item.description}</strong>
            </li>
          ))}
        </ol>
        <p className="unit-evolution-chart__hint">Renderizado a partir de atividade de manutenção/movimentação recente.</p>
      </div>
    </section>
  )
}
