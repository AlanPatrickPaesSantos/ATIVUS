import type { AcReturn } from '../../../shared/api/contracts'

type Props = {
  movements: Array<{ status: string }>
  acReturns: AcReturn[]
  loading: boolean
  error: string | null
}

const terminalStatuses = new Set(['Recebida', 'Rejeitada', 'Cancelada'])

export function MovementOperationsSummary({ movements, acReturns, loading, error }: Props) {
  if (loading) return <section className="movement-operations-summary module-panel" aria-labelledby="movement-summary-title"><h2 id="movement-summary-title">Resumo operacional</h2><p role="status">Carregando o resumo de movimentações…</p></section>
  if (error) return <section className="movement-operations-summary module-panel" aria-labelledby="movement-summary-title"><h2 id="movement-summary-title">Resumo operacional</h2><p role="alert">{error}</p></section>

  const statuses = [...movements, ...acReturns].map((item) => item.status)
  const count = (predicate: (status: string) => boolean) => statuses.filter(predicate).length
  const cards = [
    ['movement-summary-pending', 'Solicitações pendentes', count((status) => status === 'Pendente')],
    ['movement-summary-receiving', 'Aguardando recebimento', count((status) => status === 'Aguardando recebimento')],
    ['movement-summary-divergences', 'Divergências abertas', count((status) => status === 'Divergência')],
    ['movement-summary-completed', 'Movimentações concluídas', count((status) => terminalStatuses.has(status))],
  ] as const

  return <section className="movement-operations-summary module-panel" aria-labelledby="movement-summary-title"><header><div><p className="page-eyebrow">Central operacional</p><h2 id="movement-summary-title">Resumo operacional</h2></div><span className="movement-operations-summary__note">Dados das APIs de movimentações e devoluções AC</span></header><div className="movement-operations-summary__grid">{cards.map(([testId, label, value]) => <article key={testId}><span>{label}</span><strong data-testid={testId}>{value}</strong></article>)}</div></section>
}
