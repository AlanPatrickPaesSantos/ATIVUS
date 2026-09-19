type UnitAlertsPanelProps = {
  maintenanceCount: number
  attentionCount: number
  criticalCalls: number
  pendingMovements: number
}

const alertConfig = {
  maintenance: {
    label: 'Em manutenção',
    color: 'var(--sigat-warning)',
    testId: 'alert-manutencao',
  },
  attention: {
    label: 'Requer atenção',
    color: 'var(--sigat-danger)',
    testId: 'alert-requer-atencao',
  },
  criticalCalls: {
    label: 'Chamados pendentes',
    color: 'var(--sigat-operational)',
    testId: 'alert-chamados-pendentes',
  },
  pendingMovements: {
    label: 'Movimentações pendentes',
    color: 'var(--sigat-operational)',
    testId: 'alert-movimentacoes-pendentes',
  },
} as const

export function UnitAlertsPanel({
  maintenanceCount,
  attentionCount,
  criticalCalls,
  pendingMovements,
}: UnitAlertsPanelProps) {
  const alerts = [
    { key: 'maintenance', count: maintenanceCount },
    { key: 'attention', count: attentionCount },
    criticalCalls > 0 && { key: 'criticalCalls', count: criticalCalls },
    pendingMovements > 0 && { key: 'pendingMovements', count: pendingMovements },
  ]
    .filter(Boolean)
    .map(alert => alert!) as Array<{ key: keyof typeof alertConfig; count: number }>

  return (
    <section className="unit-alerts-panel" aria-label="Alertas operacionais" data-testid="unit-alerts-panel">
      <h3 className="unit-alerts-panel__title">Alertas operacionais</h3>
      {alerts.length === 0 ? (
        <div className="unit-alerts-panel__empty">
          <p>Não há alertas neste momento.</p>
        </div>
      ) : (
        <div className="unit-alerts-panel__grid">
          {alerts.map(({ key, count }) => {
            const config = alertConfig[key]
            return (
              <article
                key={key}
                className="unit-alerts-panel__alert-card"
                style={{ borderColor: config.color }}
                data-testid={config.testId}
              >
                <div className="unit-alerts-panel__alert-inner">
                  <strong className="unit-alerts-panel__alert-value" style={{ color: config.color }}>
                    {count}
                  </strong>
                  <span className="unit-alerts-panel__alert-label">{config.label}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
