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
  attention: 'var(--sigat-border, #94a3b8)',
  inactive: 'var(--sigat-danger, #ef4444)',
  lost: 'var(--sigat-border, #94a3b8)',
  writtenOff: 'var(--sigat-border, #94a3b8)',
}

export function UnitParkDonutChart({ situations, total }: UnitParkDonutChartProps) {
  const isAnyData = situations.length > 0 && total > 0
  let cursor = 0
  const gradientStops = situations
    .filter((item) => item.count > 0)
    .map((item) => {
      const start = cursor
      const end = cursor + (item.count / total) * 360
      cursor = end
      return `${situationColors[item.situation] ?? 'var(--sigat-muted)'} ${start}deg ${end}deg`
    })
    .join(', ')

  return (
    <section
      className="unit-park-donut-chart"
      data-testid="unit-park-donut"
      role="figure"
      aria-label="Gráfico circular da distribuição da unidade"
    >
      <h3 className="unit-park-donut-chart__title">Distribuição da unidade</h3>
      <p className="unit-park-donut-chart__subtitle">Equipamentos agrupados por situação nesta unidade.</p>

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
              style={{ background: `conic-gradient(${gradientStops})` }}
            />
            <div className="unit-park-donut-chart__donut-inner-wrapper">
              <strong className="unit-park-donut-chart__donut-total">
                {total}
                {' '}
                <span className="unit-park-donut-chart__donut-text">equipamentos</span>
              </strong>
            </div>
          </div>

          <div className="unit-park-donut-chart__summary">
            <span>Situações exibidas</span>
            <strong>{situations.filter((item) => item.count > 0).length}</strong>
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
