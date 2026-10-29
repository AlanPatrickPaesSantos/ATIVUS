import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPatrimonialView } from '../api/inventoryApi'
import type { PatrimonialOperation, PatrimonialReadView } from '../../../shared/api/contracts'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'

const HISTORY_PAGE_SIZE = 10
const AUDIT_PAGE_SIZE = 10

type PatrimonialOverviewProps = {
  equipmentId: string
  canViewAudit: boolean
}

export function PatrimonialOverview({ equipmentId, canViewAudit }: PatrimonialOverviewProps) {
  const [view, setView] = useState<PatrimonialReadView | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [auditPage, setAuditPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const requestVersion = useRef(0)

  useEffect(() => {
    const version = ++requestVersion.current
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    void getPatrimonialView(equipmentId, { historyPage, historyPageSize: HISTORY_PAGE_SIZE, auditPage, auditPageSize: AUDIT_PAGE_SIZE }, controller.signal).then((result) => {
      if (version === requestVersion.current) setView(result)
    }).catch(() => {
      if (version === requestVersion.current && !controller.signal.aborted) setError(true)
    }).finally(() => {
      if (version === requestVersion.current) setLoading(false)
    })
    return () => controller.abort()
  }, [auditPage, equipmentId, historyPage, retryToken])

  if (error) return <ErrorState message="Não foi possível carregar a situação patrimonial." onRetry={() => { setView(null); setRetryToken((token) => token + 1) }} />
  if (!view) return <LoadingState label="Carregando situação patrimonial" />

  const { equipment, activeOperation, history, relatedCalls, documents, auditEvents } = view
  const historyTotalPages = Math.max(1, Math.ceil(history.total / history.pageSize))
  const auditTotalPages = Math.max(1, Math.ceil(auditEvents.total / auditEvents.pageSize))
  const movementSearch = encodeURIComponent(equipment.patrimony)

  return <section className="patrimonial-overview" aria-label="Situação patrimonial integrada" aria-busy={loading}>
    {loading ? <p className="patrimonial-overview__refresh" role="status">Atualizando situação patrimonial…</p> : null}
    <div className="patrimonial-overview__grid">
      <section className="patrimonial-card patrimonial-card--custody">
        <header><span>Custódia atual confirmada</span><strong>{equipment.custody?.scope === 'AC' ? 'AC' : equipment.custody?.unit?.name ?? equipment.unit?.name ?? 'Não informada'}</strong></header>
        <p>{equipment.custody?.scope === 'AC' ? 'Responsabilidade da AC' : equipment.custody?.unit?.acronym ?? equipment.unit?.acronym ?? 'Unidade não informada'}</p>
        <small>Derivada da situação persistida do equipamento. Operações pendentes não alteram este valor.</small>
      </section>
      <section className="patrimonial-card">
        <header><span>Operação patrimonial</span><strong>{activeOperation ? 'Operação em andamento' : 'Nenhuma operação pendente.'}</strong></header>
        {activeOperation ? <OperationSummary operation={activeOperation} /> : <p>Não há transferência ou devolução aguardando ação.</p>}
      </section>
    </div>

    <section className="patrimonial-section">
      <header className="patrimonial-section__header"><div><h3>Histórico patrimonial</h3><p>Snapshots e eventos em ordem cronológica, sem carregamento ilimitado.</p></div><Link className="button-link" to={`/movimentacoes?search=${movementSearch}`}>Ver na Central de movimentações</Link></header>
      {history.items.length ? <div className="patrimonial-history">{history.items.map((entry) => <article key={entry.id} className={`patrimonial-history__item patrimonial-history__item--${entry.status ? normalizeStatus(entry.status) : 'record'}`}><div><strong>{historyLabel(entry.source, entry.status)}</strong><time dateTime={entry.occurredAt}>{formatDate(entry.occurredAt)}</time></div><p>{entry.description}</p>{entry.status ? <small>Estado registrado: {entry.status}</small> : null}</article>)}</div> : <p>Nenhuma movimentação patrimonial registrada.</p>}
      {historyTotalPages > 1 ? <Pagination label="histórico" page={history.page} totalPages={historyTotalPages} onPrevious={() => setHistoryPage((page) => Math.max(1, page - 1))} onNext={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))} /> : null}
    </section>

    <div className="patrimonial-overview__columns">
      <section className="patrimonial-section"><header className="patrimonial-section__header"><h3>Chamados relacionados</h3><strong>{relatedCalls.length}</strong></header>{relatedCalls.length ? relatedCalls.map((call) => <article className="patrimonial-reference" key={call.id}><strong>{call.protocol}</strong><span>{call.subject}</span><small>{call.status} · {formatDate(call.openedAt)}</small></article>) : <p>Nenhum chamado relacionado.</p>}</section>
      <section className="patrimonial-section"><header className="patrimonial-section__header"><h3>Documentos vinculados</h3><strong>{documents.length}</strong></header>{documents.length ? documents.map((document) => <article className="patrimonial-reference" key={`${document.source}-${document.id}`}><a href={document.downloadUrl}>{document.name}</a><small>{document.source === 'ac_transfer' ? 'Documento de transferência AC' : document.type}</small></article>) : <p>Nenhum documento vinculado.</p>}</section>
    </div>

    {canViewAudit ? <section className="patrimonial-section patrimonial-audit"><header className="patrimonial-section__header"><div><h3>Auditoria</h3><p>Eventos disponíveis para o perfil autorizado.</p></div><strong>{auditEvents.total}</strong></header>{auditEvents.items.length ? auditEvents.items.map((event) => <article className="patrimonial-reference" key={event.id}><strong>{event.action}</strong><span>{event.result === 'success' ? 'Concluído' : 'Falhou'}</span><small>{formatDate(event.createdAt)}</small></article>) : <p>Nenhum evento de auditoria encontrado.</p>}{auditTotalPages > 1 ? <Pagination label="auditoria" page={auditEvents.page} totalPages={auditTotalPages} onPrevious={() => setAuditPage((page) => Math.max(1, page - 1))} onNext={() => setAuditPage((page) => Math.min(auditTotalPages, page + 1))} /> : null}</section> : null}
  </section>
}

function OperationSummary({ operation }: { operation: PatrimonialOperation }) {
  const destination = operation.kind === 'ac_return' ? 'AC' : operation.destination && 'unit' in operation.destination ? operation.destination.unit?.name ?? 'Unidade não informada' : 'Unidade não informada'
  return <div className="patrimonial-operation"><strong>{operationLabel(operation)}</strong><span>{operation.status}</span><small>{operation.origin.name} → {destination}</small>{operation.divergenceCount > 0 ? <em>Divergência registrada: {operation.divergenceCount}</em> : null}</div>
}

function Pagination({ label, page, totalPages, onPrevious, onNext }: { label: string; page: number; totalPages: number; onPrevious: () => void; onNext: () => void }) {
  return <nav className="patrimonial-pagination" aria-label={`Paginação do ${label}`}><button type="button" aria-label={`Página anterior do ${label}`} disabled={page <= 1} onClick={onPrevious}>Anterior</button><span>Página {page} de {totalPages}</span><button type="button" aria-label={`Próxima página do ${label}`} disabled={page >= totalPages} onClick={onNext}>Próxima</button></nav>
}

function operationLabel(operation: PatrimonialOperation) { return operation.kind === 'ac_return' ? 'Devolução Unidade → AC' : 'Transferência Unidade → Unidade' }
function historyLabel(source: string, status?: string) { if (status === 'Divergência') return 'Divergência'; if (status === 'Recebida') return 'Movimentação concluída'; return source === 'ac_return' ? 'Devolução para AC' : source === 'movement' ? 'Movimentação patrimonial' : 'Registro do equipamento' }
function normalizeStatus(value: string) { return value.toLocaleLowerCase().replaceAll(' ', '-').replaceAll('ê', 'e').replaceAll('ã', 'a') }
function formatDate(value?: string) {
  if (!value) return 'Não informado'
  const date = value.slice(0, 10).split('-')
  return date.length === 3 ? `${date[2]}/${date[1]}/${date[0]}` : value
}
