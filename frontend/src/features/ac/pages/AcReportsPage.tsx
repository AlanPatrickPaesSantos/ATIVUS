import { useState, type FormEvent } from 'react'

import type { AcPatrimonialReportQuery, EquipmentSituation } from '../../../shared/api/contracts'
import type { SessionContext } from '../../../shared/auth/types'
import { useAcPatrimonialReportQuery } from '../api/acQueries'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'

type View = 'stock' | 'distributions' | 'history'
type Draft = Omit<AcPatrimonialReportQuery, 'page' | 'pageSize'>

const situations: Array<{ value: '' | EquipmentSituation; label: string }> = [
  { value: '', label: 'Todas as situações' }, { value: 'active', label: 'Ativo' }, { value: 'maintenance', label: 'Manutenção' },
  { value: 'inactive', label: 'Inativo' }, { value: 'lost', label: 'Perdido' }, { value: 'written_off', label: 'Baixado' },
]

const initialDraft: Draft = { from: '', to: '', unitId: '', patrimony: '', type: '', model: '', situation: undefined, bg: '' }

export function AcReportsPage({ session }: { session: SessionContext }) {
  const [view, setView] = useState<View>('stock')
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [filters, setFilters] = useState<Draft>(initialDraft)
  const [page, setPage] = useState(1)
  const query = useAcPatrimonialReportQuery({ ...filters, page, pageSize: 10, sort: view === 'stock' ? 'patrimony' : 'distributedAt', order: 'desc' })
  const total = view === 'stock' ? query.data?.stock.total ?? 0 : query.data?.distributions.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 10))

  function submit(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setFilters({ ...draft, situation: draft.situation || undefined })
  }

  function update(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: key === 'situation' ? (value || undefined) : value }))
  }

  return <section className="module-page ac-reports-page" aria-labelledby="ac-reports-title">
    <header className="module-page__header"><div><p className="page-eyebrow">Custódia patrimonial · AC</p><h1 id="ac-reports-title">Relatórios patrimoniais da AC</h1><p>Consulta consolidada do estoque e das distribuições, sem alterar o patrimônio.</p></div></header>
    <div className="ac-report-metrics" aria-label="Indicadores AC">
      <Metric label="Estoque disponível" value={query.data?.metrics.availableStock} />
      <Metric label="Bens distribuídos" value={query.data?.metrics.distributedGoods} />
      <Metric label="Transferências no período" value={query.data?.metrics.transfers} />
    </div>
    <form className="module-panel ac-report-filters" onSubmit={submit}>
      <label className="ac-field">De<input className="ac-control" type="date" value={draft.from ?? ''} onChange={(event) => update('from', event.target.value)} /></label>
      <label className="ac-field">Até<input className="ac-control" type="date" value={draft.to ?? ''} onChange={(event) => update('to', event.target.value)} /></label>
      <label className="ac-field">RP<input className="ac-control" value={draft.patrimony ?? ''} onChange={(event) => update('patrimony', event.target.value)} /></label>
      <label className="ac-field">Tipo<input className="ac-control" value={draft.type ?? ''} onChange={(event) => update('type', event.target.value)} /></label>
      <label className="ac-field">Modelo<input className="ac-control" value={draft.model ?? ''} onChange={(event) => update('model', event.target.value)} /></label>
      <label className="ac-field">BG<input className="ac-control" value={draft.bg ?? ''} onChange={(event) => update('bg', event.target.value)} /></label>
      <label className="ac-field">Situação<select className="ac-control" value={draft.situation ?? ''} onChange={(event) => update('situation', event.target.value)}>{situations.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}</select></label>
      <button className="button-link button-link--primary" type="submit">Aplicar filtros</button>
    </form>
    <nav className="ac-report-tabs" aria-label="Relatórios AC"><button className="ac-report-tabs__button" type="button" aria-pressed={view === 'stock'} onClick={() => { setView('stock'); setPage(1) }}>Estoque atual</button><button className="ac-report-tabs__button" type="button" aria-pressed={view === 'distributions'} onClick={() => { setView('distributions'); setPage(1) }}>Distribuições</button><button className="ac-report-tabs__button" type="button" aria-pressed={view === 'history'} onClick={() => { setView('history'); setPage(1) }}>Histórico por RP</button></nav>
    <section className="module-panel ac-report-results" aria-live="polite">
      {query.isLoading ? <LoadingState label="Carregando relatório AC" /> : null}
      {query.isError ? <ErrorState message="Não foi possível carregar o relatório AC." onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && query.data && view === 'stock' && <StockReport items={query.data.stock.items} />}
      {!query.isLoading && !query.isError && query.data && view === 'distributions' && <DistributionReport items={query.data.distributions.items} />}
      {!query.isLoading && !query.isError && query.data && view === 'history' && <HistoryReport history={query.data.history} />}
    </section>
    {view !== 'history' && <nav className="ac-report-pagination" aria-label="Paginação dos relatórios AC"><button className="button-link" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {totalPages}</span><button className="button-link" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</button></nav>}
    {query.data && <p className="ac-report-criteria">Critérios: estoque disponível = {query.data.criteria.availableStock} Bens distribuídos = {query.data.criteria.distributedGoods}</p>}
    <span className="sr-only">Consulta realizada por {session.name}</span>
  </section>
}

function Metric({ label, value }: { label: string; value?: number }) { return <article className="metric-card"><span>{label}</span><strong>{value ?? '—'}</strong></article> }

function StockReport({ items }: { items: NonNullable<ReturnType<typeof useAcPatrimonialReportQuery>['data']>['stock']['items'] }) {
  if (!items.length) return <EmptyState title="Nenhum bem encontrado no recorte." />
  return <div className="table-scroll"><table><caption>Estoque atual da AC</caption><thead><tr><th>RP</th><th>N/S</th><th>Identificação</th><th>Tipo</th><th>Modelo</th><th>Situação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.patrimony}</strong></td><td>{item.serialNumber || '—'}</td><td>{item.identification}</td><td>{item.type}</td><td>{item.model}</td><td>{item.situation}</td></tr>)}</tbody></table></div>
}

function DistributionReport({ items }: { items: NonNullable<ReturnType<typeof useAcPatrimonialReportQuery>['data']>['distributions']['items'] }) {
  if (!items.length) return <EmptyState title="Nenhuma distribuição encontrada no recorte." />
  return <div className="table-scroll"><table><caption>Distribuições realizadas</caption><thead><tr><th>Data</th><th>Unidade</th><th>Entrega</th><th>Recebimento</th><th>Quantidade</th><th>BG</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{new Date(item.distributedAt).toLocaleDateString('pt-BR')}</td><td>{item.destinationUnit.name}</td><td>{item.deliverer.name}</td><td>{item.receiver.name}</td><td>{item.quantity}</td><td>{item.bg?.number || '—'}</td></tr>)}</tbody></table></div>
}

function HistoryReport({ history }: { history: NonNullable<ReturnType<typeof useAcPatrimonialReportQuery>['data']>['history'] }) {
  if (!history) return <EmptyState title="Informe um RP para consultar o histórico." description="O histórico é consultado pelo patrimônio oficial, sem copiar registros." />
  if (!history.entries.length) return <EmptyState title="Nenhum histórico encontrado para este RP." />
  return <div><h2>Histórico do RP {history.patrimony}</h2><ol className="ac-report-history">{history.entries.map((entry) => <li key={entry.id}><span>{entry.source}</span><strong>{entry.description}</strong><time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString('pt-BR')}</time>{entry.bg && <small>BG {entry.bg}</small>}</li>)}</ol></div>
}
