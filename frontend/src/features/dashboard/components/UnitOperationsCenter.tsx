type UnitOperationsCenterProps = {
  total: number
  active: number
  maintenance: number
  attention: number
  criticalCalls: number
  pendingMovements: number
  recentActivityCount: number
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function UnitOperationsCenter({
  total,
  active,
  maintenance,
  attention,
  criticalCalls,
  pendingMovements,
  recentActivityCount,
}: UnitOperationsCenterProps) {
  const healthScore = total > 0 ? (active / total) * 100 : 0
  const attentionScore = total > 0 ? ((maintenance + attention) / total) * 100 : 0
  const operationalStatus = attentionScore === 0
    ? 'Operação estável'
    : attentionScore >= 50
      ? 'Atenção imediata'
      : 'Acompanhar pendências'

  const workload = [
    {
      label: 'Chamados críticos',
      value: criticalCalls,
      text: formatCount(criticalCalls, 'chamado crítico', 'chamados críticos'),
    },
    {
      label: 'Movimentações pendentes',
      value: pendingMovements,
      text: formatCount(pendingMovements, 'movimentação pendente', 'movimentações pendentes'),
    },
    {
      label: 'Atividades recentes',
      value: recentActivityCount,
      text: formatCount(recentActivityCount, 'atividade recente', 'atividades recentes'),
    },
  ]

  return (
    <section className="unit-operations-center" data-testid="unit-operations-center" aria-label="Centro operacional">
      <div className="unit-operations-center__header">
        <div>
          <h3 className="unit-operations-center__title">Centro operacional</h3>
          <p>
            <strong>Como funciona:</strong>
            {' '}
            combina equipamentos ativos, pendências e movimentações para indicar se a unidade exige ação.
          </p>
        </div>
        <strong className="unit-operations-center__status">{operationalStatus}</strong>
      </div>

      <div className="unit-operations-center__body">
        <div
          className="unit-operations-center__gauge"
          style={{
            background: `conic-gradient(var(--sigat-success) 0deg ${healthScore * 3.6}deg, rgb(15 23 42 / 92%) ${healthScore * 3.6}deg 360deg)`,
          }}
          role="figure"
          aria-label={`Saúde da unidade: ${formatPercent(healthScore)}`}
        >
          <span>Saúde da unidade</span>
          <strong>{formatPercent(healthScore)}</strong>
        </div>

        <div className="unit-operations-center__insights">
          <div className="unit-operations-center__ratio">
            <span>Equipamentos em operação</span>
            <strong>
              {active}
              {' / '}
              {total}
            </strong>
          </div>
          <div className="unit-operations-center__risk-bar" aria-label={`Carga de atenção: ${formatPercent(attentionScore)}`}>
            <span style={{ width: `${Math.min(attentionScore, 100)}%` }} />
          </div>
          <p>
            {maintenance + attention === 0
              ? 'Nenhum equipamento exige intervenção neste momento.'
              : `${maintenance + attention} equipamento(s) exigem acompanhamento.`}
          </p>
        </div>
      </div>

      <div className="unit-operations-center__workload" aria-label="Pendências reais da unidade">
        {workload.map((item) => (
          <article key={item.label} className={item.value > 0 ? 'is-active' : undefined}>
            <span>{item.label}</span>
            <strong>{item.text}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
