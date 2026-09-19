type UnitCallsBarChartProps = {
  callsByStatus: Array<{ status: string; label: string; count: number }>
}

const statusConfig = {
  Aberto: { label: 'Aberto', color: 'var(--sigat-operational, #2563eb)' },
  'Em andamento': { label: 'Em andamento', color: 'var(--sigat-warning, #f59e0b)' },
  Resolvido: { label: 'Resolvido', color: 'var(--sigat-success, #22c55e)' },
  Cancelado: { label: 'Cancelado', color: 'var(--sigat-muted, #64748b)' },
}

const callLabels: Record<string, string> = {
  Aberto: 'Abertos',
  'Em andamento': 'Em andamento',
  Resolvido: 'Resolvidos',
  Cancelado: 'Cancelados',
}

export function UnitCallsBarChart({ callsByStatus }: UnitCallsBarChartProps) {
  const total = callsByStatus.reduce((sum, c) => sum + c.count, 0)

  const chartSegments = callsByStatus
    .map(item => {
      const percent = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0'
      const statusKey = item.label || item.status
      const config = statusConfig[statusKey as keyof typeof statusConfig] || {
        label: statusKey,
        color: 'var(--sigat-muted)',
      }
      return {
        label: callLabels[statusKey] || statusKey,
        count: item.count,
        percent: percent,
        color: config.color,
      }
    })
    .filter(item => item.count > 0)

  return (
    <section className="unit-calls-bar-chart" data-testid="unit-calls-chart">
      <div className="unit-calls-bar-chart__header">
        <div>
          <h3 className="unit-calls-bar-chart__title">Chamados da unidade</h3>
          <p>Distribuição dos chamados por status de atendimento.</p>
        </div>
        <strong>
          {total}
          {' '}
          {total === 1 ? 'chamado' : 'chamados'}
        </strong>
      </div>

      {!chartSegments.length ? (
        <div className="unit-calls-bar-chart__empty">
          <p>Nenhum chamado registrado</p>
          <p>Não há chamados para esta unidade no período selecionado.</p>
        </div>
      ) : (
        <div className="unit-calls-bar-chart__content">
          <div className="unit-calls-bar-chart__bar-wrapper">
            {chartSegments.map(segment => (
              <article
                key={segment.label}
                className="unit-calls-bar-chart__bar-item"
                aria-label={`${segment.label}: ${segment.count} (${segment.percent}%)`}
              >
                <strong>{segment.count}</strong>
                <div
                  className="unit-calls-bar-chart__bar"
                  style={{ height: `${segment.percent}%`, backgroundColor: segment.color }}
                  title={`${segment.label}: ${segment.count} (${segment.percent}%)`}
                />
                <span>{segment.label}</span>
              </article>
            ))}
          </div>
          <ul className="unit-calls-bar-chart__legend">
            {chartSegments.map(segment => (
              <li key={segment.label} className="unit-calls-bar-chart__legend-item">
                <span
                  className="unit-calls-bar-chart__legend-dot"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
                <div className="unit-calls-bar-chart__legend-inner">
                  <span className="unit-calls-bar-chart__legend-label">{segment.label}</span>
                  <strong className="unit-calls-bar-chart__legend-value">
                    {segment.count}
                    {' '}
                    ({segment.percent}%)
                  </strong>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
