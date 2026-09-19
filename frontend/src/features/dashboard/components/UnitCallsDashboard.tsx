import { EmptyState } from '../../../shared/ui/feedback/EmptyState'

type UnitCallsDashboardProps = {
  callsByStatus: Array<{
    status: string
    label: string
    count: number
  }>
}

export function UnitCallsDashboard({ callsByStatus }: UnitCallsDashboardProps) {
  if (!callsByStatus || callsByStatus.length === 0) {
    return (
      <div className="unit-calls-dashboard" data-testid="unit-calls-dashboard">
        <h2>Chamados da unidade</h2>
        <EmptyState title="Nenhum chamado registrado" description="Não há chamados para esta unidade no período selecionado." />
      </div>
    )
  }

  const total = callsByStatus.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="unit-calls-dashboard" data-testid="unit-calls-dashboard">
      <h2>Chamados da unidade</h2>
      <div className="calls-bar" role="figure" aria-label="Gráfico de barras dos chamados por status">
        {callsByStatus.map((item) => {
          const percent = total > 0 ? Math.round((item.count / total) * 100) : 0
          const color = item.status === 'Aberto' ? 'var(--sigat-operational, #2563eb)' : item.status === 'Em andamento' ? 'var(--sigat-warning, #f59e0b)' : item.status === 'Resolvido' ? 'var(--sigat-success, #22c55e)' : 'var(--sigat-muted, #64748b)'
          return (
            <div key={item.status} className="calls-bar__segment" style={{ height: `${percent}%`, backgroundColor: color }} title={`${item.label}: ${item.count} (${percent}%)`}></div>
          )
        })}
      </div>
      <ul className="calls-legend">
        {callsByStatus.map((item) => (
          <li key={item.status} className="calls-legend__item">
            <span className="legend-color" style={{ backgroundColor: item.status === 'Aberto' ? 'var(--sigat-operational, #2563eb)' : item.status === 'Em andamento' ? 'var(--sigat-warning, #f59e0b)' : item.status === 'Resolvido' ? 'var(--sigat-success, #22c55e)' : 'var(--sigat-muted, #64748b)' }}></span>
            <div className="legend-info">
              <span className="legend-label">{item.label}</span>
              <strong className="legend-value">{item.count} ({Math.round((item.count / total) * 100)}%)</strong>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
