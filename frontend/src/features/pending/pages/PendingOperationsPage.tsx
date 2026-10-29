import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPendingOperations } from '../api/pendingApi'
import type { PendingOperation, PendingOperationsResponse, PendingSource } from '../../../shared/api/contracts'
import type { SessionContext } from '../../../shared/auth/types'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import '../pending.css'

const sourceLabels: Record<PendingSource, string> = { movement: 'Transferência', ac_return: 'Devolução AC', call: 'Chamado', maintenance: 'Manutenção', mission: 'Missão técnica' }
const allSourceOptions: Array<{ value: PendingSource | ''; label: string }> = [{ value: '', label: 'Todas as origens' }, ...Object.entries(sourceLabels).map(([value, label]) => ({ value: value as PendingSource, label }))]

export function PendingOperationsPage({ session }: { session: SessionContext }) {
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<PendingSource | ''>('')
  const [state, setState] = useState('')
  const [priority, setPriority] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PendingOperationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const requestId = useRef(0)
  const query = useMemo(() => ({ page, pageSize: 20, ...(search.trim() ? { search: search.trim() } : {}), ...(source ? { source } : {}), ...(state ? { state } : {}), ...(priority ? { priority } : {}) }), [page, priority, search, source, state])
  const sourceOptions = session.role === 'ac_operator' ? allSourceOptions.filter((option) => option.value === '' || option.value === 'ac_return') : allSourceOptions

  useEffect(() => {
    const controller = new AbortController()
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(false)
    void getPendingOperations(query, controller.signal).then((response) => {
      if (!controller.signal.aborted && currentRequest === requestId.current) setData(response)
    }).catch(() => {
      if (!controller.signal.aborted && currentRequest === requestId.current) { setData(null); setError(true) }
    }).finally(() => {
      if (!controller.signal.aborted && currentRequest === requestId.current) setLoading(false)
    })
    return () => controller.abort()
  }, [query, refreshToken])

  function resetPage<T>(setter: (value: T) => void, value: T) { setter(value); setPage(1) }
  const items: PendingOperation[] = data?.items ?? []

  return <section className="pending-page" aria-labelledby="pending-page-title">
    <header className="pending-page__header">
      <div><p className="eyebrow">Operação</p><h1 id="pending-page-title">Central de pendências</h1><p>Ações que aguardam providência nos módulos patrimoniais e operacionais.</p></div>
      <span className="pending-page__scope">{session.role === 'ditel_admin' ? 'Escopo estadual' : session.role === 'ac_operator' ? 'Custódia AC' : session.unit?.name ?? 'Sua unidade'}</span>
    </header>
    <div className="pending-counts" aria-label="Contadores de pendências">
      {data?.counts.map((count) => <span className="pending-count" key={count.source}><strong>{count.total}</strong> {sourceLabels[count.source]}</span>)}
      {data && data.counts.length === 0 ? <span className="pending-count pending-count--empty">Nenhuma pendência encontrada</span> : null}
    </div>
    <div className="pending-filters" aria-label="Filtros de pendências">
      <label>Buscar<input value={search} onChange={(event) => resetPage(setSearch, event.target.value)} placeholder="Protocolo, equipamento ou descrição" /></label>
      <label>Origem<select value={source} onChange={(event) => resetPage(setSource, event.target.value as PendingSource | '')}>{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Estado<select value={state} onChange={(event) => resetPage(setState, event.target.value)}><option value="">Todos os estados</option><option value="Pendente">Pendente</option><option value="Aguardando recebimento">Aguardando recebimento</option><option value="Divergência">Divergência</option><option value="Aberto">Aberto</option><option value="Em atendimento">Em atendimento</option><option value="open">Aberta</option><option value="in_progress">Em andamento</option><option value="assigned">Atribuída</option></select></label>
      <label>Prioridade<select value={priority} onChange={(event) => resetPage(setPriority, event.target.value)}><option value="">Todas</option><option value="Baixa">Baixa</option><option value="Média">Média</option><option value="Alta">Alta</option><option value="Crítica">Crítica</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label>
    </div>
    {loading ? <LoadingState label="Carregando pendências" /> : null}
    {error ? <ErrorState message="Não foi possível carregar a Central de pendências." onRetry={() => setRefreshToken((current) => current + 1)} /> : null}
    {!loading && !error && data && items.length === 0 ? <div className="empty-state" role="status"><h2>Nenhuma pendência</h2><p>Os filtros atuais não encontraram providências pendentes.</p></div> : null}
    {!loading && !error && items.length > 0 ? <div className="pending-list" aria-label="Lista de pendências">{items.map((item) => <PendingRow item={item} key={`${item.source}-${item.id}`} />)}</div> : null}
    {data && data.totalPages > 0 ? <nav className="pending-pagination" aria-label="Paginação de pendências"><button type="button" className="button-link" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Página {page} de {data.totalPages}</span><button type="button" className="button-link" disabled={page >= data.totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button></nav> : null}
  </section>
}

function PendingRow({ item }: { item: PendingOperation }) {
  return <article className="pending-row">
    <div className="pending-row__main"><span className="pending-row__source">{sourceLabels[item.source]}</span><h2>{item.description}</h2><p>{item.action}</p></div>
    <dl className="pending-row__meta"><div><dt>Estado</dt><dd>{item.state}</dd></div>{item.priority ? <div><dt>Prioridade</dt><dd>{item.priority}</dd></div> : null}<div><dt>Data</dt><dd>{new Date(item.date).toLocaleString('pt-BR')}</dd></div></dl>
    <Link className="button-link button-link--primary" to={item.reference.path}>Abrir {item.reference.label}</Link>
  </article>
}
