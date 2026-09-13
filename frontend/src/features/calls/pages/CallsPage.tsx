import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EquipmentSummary } from '../../../shared/api/contracts'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { getEquipmentDetails, getInventory } from '../../inventory/api/inventoryApi'
import { CallForm } from '../components/CallForm'
import { CallReview } from '../components/CallReview'
import { CallDetailModal } from '../components/CallDetailModal'
import { getCalls, submitCall, type CallDraft, type CallQueueItem } from '../api/callsApi'

const emptyDraft: CallDraft = { problem: 'software', priority: 'medium', subject: '', description: '', attachments: [] }
const EQUIPMENT_PAGE_SIZE = 20
const callStatuses = ['Aberto', 'Em análise', 'Em atendimento', 'Aguardando informação', 'Resolvido', 'Encerrado']
const overviewStatuses = ['Aberto', 'Em análise', 'Em atendimento', 'Aguardando informação', 'Resolvido', 'Encerrado']

export function CallsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([])
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [equipmentPage, setEquipmentPage] = useState(1)
  const [equipmentTotal, setEquipmentTotal] = useState(0)
  const [loadingEquipment, setLoadingEquipment] = useState(true)
  const [equipmentError, setEquipmentError] = useState(false)
  const [draft, setDraft] = useState<CallDraft>(() => ({ ...emptyDraft, equipmentId: searchParams.get('equipmentId') ?? undefined }))
  const [reviewing, setReviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState(false)
  const [protocol, setProtocol] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [unitCalls, setUnitCalls] = useState<CallQueueItem[]>([])
  const [loadingCalls, setLoadingCalls] = useState(true)
  const [callsError, setCallsError] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedCall, setSelectedCall] = useState<CallQueueItem | null>(null)
  const equipmentRequestSequence = useRef(0)

  const loadEquipment = (page = 1, search = equipmentSearch, append = false) => {
    const requestSequence = ++equipmentRequestSequence.current
    setLoadingEquipment(true)
    setEquipmentError(false)
    void getInventory({ page, pageSize: EQUIPMENT_PAGE_SIZE, search }).then((response) => {
      if (requestSequence !== equipmentRequestSequence.current) return
      setEquipment((current) => append ? [...current, ...response.items.filter((item) => !current.some((existing) => existing.id === item.id))] : response.items)
      setEquipmentPage(page)
      setEquipmentTotal(response.total)
    }).catch(() => {
      if (requestSequence !== equipmentRequestSequence.current) return
      setEquipmentError(true)
    }).finally(() => {
      if (requestSequence !== equipmentRequestSequence.current) return
      setLoadingEquipment(false)
    })
  }

  useEffect(() => { loadEquipment() }, [])
  const loadCalls = () => {
    setLoadingCalls(true)
    setCallsError(false)
    void getCalls()
      .then((response) => setUnitCalls(response.items))
      .catch(() => {
        setUnitCalls([])
        setCallsError(true)
      })
      .finally(() => setLoadingCalls(false))
  }
  useEffect(() => { loadCalls() }, [])

  useEffect(() => {
    const equipmentId = searchParams.get('equipmentId')
    if (!equipmentId) return
    void getEquipmentDetails(equipmentId).then((details) => {
      setEquipment((current) => current.some((item) => item.id === details.id) ? current : [details, ...current])
    }).catch(() => undefined)
  }, [searchParams])

  const selectedEquipment = useMemo(() => equipment.find((item) => item.id === draft.equipmentId), [draft.equipmentId, equipment])
  const visibleCalls = useMemo(() => statusFilter === 'all' ? unitCalls : unitCalls.filter((call) => call.status === statusFilter), [statusFilter, unitCalls])

  async function createCall() {
    setSubmitting(true)
    setSubmissionError(false)
    try {
      const created = await submitCall(draft)
      setProtocol(created.protocol)
      setReviewing(false)
    } catch {
      setSubmissionError(true)
    } finally {
      setSubmitting(false)
    }
  }

  function startAnother() {
    setSearchParams({})
    setDraft({ ...emptyDraft })
    setProtocol(null)
    setSubmissionError(false)
    setAttachmentError(null)
  }

  return <section className="calls-page" data-testid="calls-operation-flow" data-visual-variant="operational-call-flow" aria-labelledby="calls-title">
    <header className="calls-page__header"><div><p className="page-eyebrow">Atendimento técnico · Unidade autenticada</p><h1 id="calls-title">Chamados da Unidade</h1><p>Acompanhe solicitações em andamento ou registre uma nova ocorrência.</p></div></header>
    {!protocol && <section className="calls-overview" aria-labelledby="my-calls-title"><header><div><p className="page-eyebrow">Acompanhamento operacional</p><h2 id="my-calls-title">Meus chamados</h2><p>Consulte o andamento e retome solicitações da sua Unidade.</p></div><button className="button-link button-link--primary" type="button" onClick={() => document.getElementById('call-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Abrir chamado</button></header><div className="calls-overview__metrics" aria-label="Resumo por situação">{overviewStatuses.map((status) => <button type="button" className={statusFilter === status ? 'is-active' : ''} key={status} onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}><strong>{unitCalls.filter((call) => call.status === status).length}</strong><small>{status}</small></button>)}</div><div className="calls-overview__filters" aria-label="Filtros de situação"><button type="button" className={statusFilter === 'all' ? 'is-active' : ''} onClick={() => setStatusFilter('all')}>Todos</button>{callStatuses.map((status) => <button type="button" className={statusFilter === status ? 'is-active' : ''} key={status} onClick={() => setStatusFilter(status)}>{status}</button>)}</div><div className="calls-overview__list"><div className="calls-overview__list-header"><span>Chamado</span><span>Prioridade</span><span>Situação</span></div>{loadingCalls ? <LoadingState label="Carregando chamados da Unidade" /> : callsError ? <ErrorState message="Não foi possível carregar os chamados da Unidade." onRetry={loadCalls} /> : visibleCalls.length ? visibleCalls.map((call) => <button type="button" className="calls-overview__row" key={call.id} onClick={() => setSelectedCall(call)}><div><strong>{call.subject}</strong><small>{call.id.toUpperCase()}</small></div><span className="calls-overview__priority">{call.priority}</span><span className="calls-overview__status">{call.status}</span></button>) : <p>Nenhum chamado encontrado para este filtro.</p>}</div></section>}
    {protocol ? <section className="call-success" role="status"><h2>Chamado enviado</h2><p>Protocolo <strong>{protocol}</strong>. A equipe responsável receberá sua solicitação.</p><button type="button" className="button-link button-link--primary" onClick={startAnother}>Abrir novo chamado</button></section> : null}
    {!protocol && loadingEquipment ? <LoadingState label="Carregando equipamentos da Unidade" /> : null}
    {!protocol && equipmentError ? <ErrorState message="Não foi possível carregar os equipamentos para associação." onRetry={loadEquipment} /> : null}
    {!protocol && (!loadingEquipment || equipment.length > 0) && !equipmentError && !reviewing ? <div id="call-form"><CallForm draft={draft} equipment={equipment} equipmentSearch={equipmentSearch} hasMoreEquipment={equipment.length < equipmentTotal} onEquipmentSearch={(value) => { setEquipmentSearch(value); setEquipmentPage(1); loadEquipment(1, value) }} onLoadMoreEquipment={() => { loadEquipment(equipmentPage + 1, equipmentSearch, true) }} attachmentError={attachmentError} onAttachmentError={setAttachmentError} onChange={(next) => { setDraft(next); setSubmissionError(false) }} onReview={() => setReviewing(true)} /></div> : null}
    {!protocol && !loadingEquipment && !equipmentError && reviewing ? <CallReview draft={draft} equipment={selectedEquipment} submitting={submitting} error={submissionError} onBack={() => { setReviewing(false); setSubmissionError(false) }} onSubmit={() => { void createCall() }} /> : null}
    <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />
  </section>
}
