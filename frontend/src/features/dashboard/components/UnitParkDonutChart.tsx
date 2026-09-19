import type { SituationCount } from '../api/dashboardApi'

type UnitParkDonutChartProps = {
  situations: SituationCount[]
  total: number
}

const situationLabels: Record<string, string> = {
  active: 'Ativos',
  maintenance: 'Em manutenção',
  attention: 'Requer atenção',
  inactive: 'Inativos',
  lost: 'Perdidos',
  writtenOff: 'Baixados',
}

const situationColors: Record<string, string> = {
  active: 'var(--sigat-success, #22c55e)',
  maintenance: 'var(--sigat-warning, #f59e0b)',
  attention: 'var(--sigat-danger, #ef4444)',
  inactive: 'var(--sigat-muted, #64748b)',
  lost: 'var(--sigat-border, #94a3b8)',
  writtenOff: 'var(--sigat-border, #94a3b8)',
}

export function UnitParkDonutChart({ situations, total }: UnitParkDonutChartProps) {
  const percentageOfTotal = total > 0 ? (situations.reduce((sum, s) => sum + s.count, 0) / total) * 100 : 0
  const isAnyData = situations.length > 0 && total > 0

  return (
    <section
      className="unit-park-donut-chart"
      data-testid="unit-park-donut"
      role="figure"
      aria-label="Gráfico circular da distribuição do parque"
    >
      <h3 className="unit-park-donut-chart__title">Distribuição do parque</h3>
      <p className="unit-park-donut-chart__subtitle">Proporção dos equipamentos por situação atual.</p>

      {!isAnyData ? (
        <div className="unit-park-donut-chart__empty">
          <strong>Nenhuma situação disponível</strong>
          <span>Não há equipamentos cadastrados para calcular a distribuição.</span>
        </div>
      ) : (
        <div className="unit-park-donut-chart__grid">
          <div className="unit-park-donut-chart__donut">
            <div
              className="unit-park-donut-chart__donut-segment"
              style={{ opacity: Math.max(0.4, percentageOfTotal / 100) }}
            />
            <div className="unit-park-donut-chart__donut-inner-wrapper">
              <strong className="unit-park-donut-chart__donut-total">
                {total}
                {' '}
                <span className="unit-park-donut-chart__donut-text">total</span>
              </strong>
            </div>
          </div>

          <div className="unit-park-donut-chart__legend" role="list" aria-label="Legenda da distribuição">
            {situations
              .filter((item) => item.count > 0)
              .map((item) => {
                const percentage = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0'
                return (
                  <li
                    key={item.situation}
                    className="unit-park-donut-chart__legend-item"
                    role="listitem"
                  >
                    <div className="unit-park-donut-chart__legend-inner">
                      <span
                        className="unit-park-donut-chart__legend-dot"
                        style={{ backgroundColor: situationColors[item.situation] }}
                        aria-hidden="true"
                      />
                      <div className="unit-park-donut-chart__legend-info">
                        <strong className="unit-park-donut-chart__legend-label">
                          {situationLabels[item.situation] || item.situation}
                        </strong>
                        <span className="unit-park-donut-chart__legend-values">
                          {item.count}
                          {' '}
                          ({percentage}%)
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
          </div>
        </div>
      )}
    </section>
  )
}
