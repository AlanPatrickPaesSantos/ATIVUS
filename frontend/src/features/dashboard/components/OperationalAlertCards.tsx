type OperationalAlertProps = {
  maintenanceCount: number
  attentionCount: number
  pendingCallsCount?: number
  pendingMovementsCount?: number
}

export function OperationalAlertCards({ maintenanceCount, attentionCount, pendingCallsCount, pendingMovementsCount }: OperationalAlertProps) {
  const alerts = [
    { label: 'Em manutenção', count: maintenanceCount, color: 'var(--sigat-warning, #f59e0b)' },
    { label: 'Requer atenção', count: attentionCount, color: 'var(--sigat-danger, #ef4444)' },
    pendingCallsCount !== undefined && { label: 'Chamados pendentes', count: pendingCallsCount, color: 'var(--sigat-operational, #2563eb)' },
    pendingMovementsCount !== undefined && { label: 'Movimentações pendentes', count: pendingMovementsCount, color: 'var(--sigat-operational, #2563eb)' },
  ].filter(Boolean) as Array<{ label: string; count: number; color: string }>

  if (alerts.length === 0) {
    return (
      <div className="operational-alert-cards" data-testid="operational-alert-cards">
        <h2>Alertas operacionais</h2>
        <p>Não há alertas neste momento.</p>
      </div>
    )
  }

  return (
    <section className="operational-alert-cards" data-testid="operational-alert-cards">
      <h2>Alertas operacionais</h2>
      <div className="alert-cards-grid">
        {alerts.map((alert) => (
          <article key={alert.label} className="alert-card" style={{ borderColor: alert.color }}>
            <strong style={{ color: alert.color }}>{alert.count}</strong>
            <span>{alert.label}</span>
          </article>
        ))}
      </div>
    </section>
  )
}
