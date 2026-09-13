type UnitMetricCardsProps = {
  metrics: {
    total: number
    active: number
    maintenance: number
    attention: number
  }
  inactive?: number
}

const cards = [
  { key: 'total', label: 'Total de equipamentos', status: 'operational' },
  { key: 'active', label: 'Ativos', status: 'available' },
  { key: 'maintenance', label: 'Em manutenção', status: 'attention' },
  { key: 'inactive', label: 'Inativos', status: 'critical' },
  { key: 'attention', label: 'Dados pendentes', status: 'attention' },
] as const

export function UnitMetricCards({ metrics, inactive = 0 }: UnitMetricCardsProps) {
  return (
    <section aria-label="Métricas de equipamentos" className="unit-metric-cards" data-visual-variant="operational-metrics">
      {cards.map(({ key, label, status }) => (
        <article key={key} className={`unit-metric-cards__card unit-metric-cards__card--${status}`}>
          <h2>{label}</h2>
          <p>{key === 'inactive' ? inactive : metrics[key]}</p>
        </article>
      ))}
    </section>
  )
}
