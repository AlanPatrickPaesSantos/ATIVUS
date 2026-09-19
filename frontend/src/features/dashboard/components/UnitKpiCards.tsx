import type { UnitDashboardGridProps } from './UnitDashboardGrid'

type UnitKpiCardsProps = {
  metrics: UnitDashboardGridProps['metrics']
  inactive: number
}

export function UnitKpiCards({ metrics, inactive }: UnitKpiCardsProps) {
  const kpis = [
    {
      label: 'Total de equipamentos',
      value: metrics.total,
      color: 'var(--sigat-muted)',
      testId: 'kpi-total-equipamentos',
    },
    {
      label: 'Ativos',
      value: metrics.active,
      color: 'var(--sigat-success)',
      testId: 'kpi-ativos',
    },
    {
      label: 'Em manutenção',
      value: metrics.maintenance,
      color: 'var(--sigat-warning)',
      testId: 'kpi-manutencao',
    },
    {
      label: 'Inativos',
      value: inactive,
      color: 'var(--sigat-danger)',
      testId: 'kpi-inativos',
    },
  ]

  return (
    <section className="unit-kpi-cards" aria-label="Indicadores principais">
      <h2 id="unit-dashboards-section-title" className="unit-kpi-cards__title">
        Dashboards da Unidade
      </h2>
      <div className="unit-kpi-cards__grid">
        {kpis.map((kpi) => (
          <article
            key={kpi.label}
            className="unit-kpi-card"
            style={{ borderColor: kpi.color }}
            data-testid={kpi.testId}
          >
            <div className="unit-kpi-card__content">
              <span className="unit-kpi-card__label">{kpi.label}</span>
              <strong className="unit-kpi-card__value" style={{ color: kpi.color }}>
                {kpi.value}
              </strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
