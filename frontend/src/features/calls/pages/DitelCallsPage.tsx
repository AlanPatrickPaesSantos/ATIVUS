import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../../../shared/api/errors'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { getCallDetails, getCalls, sectionForCall, triageCall, type CallDetails, type CallPriority, type CallQueueItem, type ResponsibleSection } from '../api/callsApi'

const priorityOptions: Array<{ value: CallPriority; label: string }> = [
  { value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }, { value: 'critical', label: 'Crítica' },
]

function isResolvedCall(call: CallQueueItem) {
  return ['Resolvido', 'Encerrado'].includes(call.status)
}

function equipmentLabel(details: CallDetails | null) {
  if (!details?.equipment) return 'Não informado'
  return `${details.equipment.type} · ${details.equipment.patrimony}`
}

function attachmentsLabel(details: CallDetails | null) {
  if (!details?.attachments.length) return 'Nenhum anexo encaminhado'
  return `${details.attachments.length} ${details.attachments.length === 1 ? 'anexo registrado' : 'anexos registrados'}`
}

export function DitelCallsPage() {
  const [unitId, setUnitId] = useState('all')
  const [status, setStatus] = useState('pending')
  const [priority, setPriority] = useState('all')
  const [section, setSection] = useState('all')
  const [search, setSearch] = useState('')
  const [queue, setQueue] = useState<CallQueueItem[]>([])
  const [loadingCalls, setLoadingCalls] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedCall, setSelectedCall] = useState<CallQueueItem | null>(null)
  const [triagePriority, setTriagePriority] = useState<CallPriority>('critical')
  const [triageStatus, setTriageStatus] = useState('Em atendimento')
  const [triageSection, setTriageSection] = useState<ResponsibleSection>('Telecom')
  const [triageSaved, setTriageSaved] = useState(false)
  const [triageError, setTriageError] = useState('')
  const [triageSubmitting, setTriageSubmitting] = useState(false)
  const [triageConflict, setTriageConflict] = useState(false)
  const [triageRefreshMessage, setTriageRefreshMessage] = useState('')
  const [callDetails, setCallDetails] = useState<CallDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  useEffect(() => {
    void loadCalls()
  }, [])

  async function loadCalls() {
    setLoadingCalls(true)
    setLoadError(false)
    try {
      const response = await getCalls()
      setQueue(response.items)
      return response.items
    } catch {
      setQueue([])
      setLoadError(true)
      return null
    } finally {
      setLoadingCalls(false)
    }
  }

  const calls = useMemo(() => queue.filter((call) => (unitId === 'all' || call.unitId === unitId) && (status === 'all' || (status === 'pending' ? !isResolvedCall(call) : isResolvedCall(call))) && (priority === 'all' || call.priority.toLocaleLowerCase().startsWith(priority === 'critical' ? 'crít' : priority === 'high' ? 'alta' : priority === 'medium' ? 'média' : 'baixa')) && (section === 'all' || sectionForCall(call) === section) && `${call.subject} ${call.unitName}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [priority, queue, search, section, status, unitId])

  function openTriage(call: CallQueueItem) {
    setSelectedCall(call); setTriagePriority(call.priority.toLocaleLowerCase().includes('crít') ? 'critical' : call.priority.toLocaleLowerCase().includes('alta') ? 'high' : call.priority.toLocaleLowerCase().includes('baixa') ? 'low' : 'medium'); setTriageStatus(call.status); setTriageSection(sectionForCall(call) as ResponsibleSection); setTriageSaved(false); setTriageError(''); setTriageConflict(false); setTriageRefreshMessage(''); setCallDetails(null); void loadCallDetails(call.id)
  }

  async function loadCallDetails(callId: string) {
    setLoadingDetails(true)
    setDetailsError('')
    try {
      const details = await getCallDetails(callId)
      setCallDetails(details)
      setSelectedCall((current) => current?.id === details.id ? { ...current, status: details.status, priority: details.priority, section: details.section, updatedAt: details.updatedAt } : current)
      return details
    } catch {
      setCallDetails(null)
      setDetailsError('Não foi possível carregar os detalhes do chamado.')
      return null
    } finally {
      setLoadingDetails(false)
    }
  }

  async function saveTriage() {
    if (!selectedCall) return
    if (!selectedCall.updatedAt) { setTriageError('Não foi possível confirmar a versão atual do chamado.'); setTriageConflict(true); return }
    setTriageSubmitting(true)
    setTriageError('')
    setTriageRefreshMessage('')
    try {
      const updated = await triageCall(selectedCall.id, { status: triageStatus, priority: triagePriority, section: triageSection, updatedAt: selectedCall.updatedAt })
      setQueue((items) => items.map((call) => call.id === updated.id ? updated : call))
      setSelectedCall(null)
      setTriageConflict(false)
      setTriageSaved(true)
    } catch (error) {
      setTriageError(error instanceof Error ? error.message : 'Não foi possível registrar a triagem.')
      setTriageConflict(error instanceof ApiError && error.code === 'USER_CONFLICT')
    } finally {
      setTriageSubmitting(false)
    }
  }

  async function refreshSelectedCall() {
    if (!selectedCall) return
    setTriageError('')
    setTriageRefreshMessage('')
    const items = await loadCalls()
    if (!items) {
      setTriageError('Não foi possível recarregar os chamados atuais.')
      return
    }
    const current = items.find((call) => call.id === selectedCall.id)
    if (!current) {
      setTriageError('Chamado não encontrado na fila atual.')
      return
    }
    setSelectedCall(current)
    const details = await loadCallDetails(current.id)
    if (!details) {
      setTriageError('Não foi possível recarregar os detalhes atuais do chamado.')
      return
    }
    setTriageConflict(false)
    setTriageRefreshMessage('Dados atuais recarregados. Revise o histórico e tente salvar novamente.')
  }

  const triageActionLabel = triageSubmitting ? 'Salvando...' : triageError || triageRefreshMessage ? 'Tentar novamente' : 'Salvar triagem'

  return <section className="module-page ditel-calls-page" aria-labelledby="ditel-calls-title">
    <header className="module-page__header"><div><p className="page-eyebrow">Atendimento técnico · escopo estadual</p><h1 id="ditel-calls-title">Chamados estaduais</h1><p>Consulte, priorize e encaminhe os chamados recebidos das Unidades.</p></div><span className="module-total">{calls.length} registros</span></header>
    <section className="module-panel ditel-call-filters" aria-label="Filtros da fila estadual"><label>Buscar chamado<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Assunto ou unidade" /></label><label>Unidade<select aria-label="Filtrar chamados por unidade" value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="all">Todas as unidades</option><option value="unit-centro">Unidade Centro</option><option value="unit-norte">Unidade Norte</option><option value="ciop">CIOp Metropolitano</option></select></label><label>Prioridade<select aria-label="Filtrar chamados por prioridade" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Todas as prioridades</option>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Seção<select aria-label="Filtrar chamados por seção" value={section} onChange={(event) => setSection(event.target.value)}><option value="all">Todas as seções</option><option value="Suporte">Suporte</option><option value="Telecom">Telecom</option></select></label><label>Situação<select aria-label="Situação do chamado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Abertos e pendentes</option><option value="all">Todos os chamados</option><option value="resolved">Resolvidos e encerrados</option></select></label></section>
    {triageSaved && <p className="module-export-status" role="status">Triagem registrada no chamado.</p>}
    {triageError && !selectedCall && <p className="module-export-status" role="alert">{triageError}</p>}
    <div className="movement-list">{loadingCalls ? <LoadingState label="Carregando chamados estaduais" /> : loadError ? <ErrorState message="Não foi possível carregar os chamados estaduais." onRetry={loadCalls} /> : calls.map((call) => <article className="module-panel movement-item" key={call.id}><div><span className="movement-kind movement-kind--baixa">{call.priority}</span><h2>{call.subject}</h2><p>{call.unitName} · {call.id.toUpperCase()}</p></div><dl><div><dt>Status</dt><dd>{call.status}</dd></div><div><dt>Seção</dt><dd>{sectionForCall(call)}</dd></div></dl><button type="button" className="button-link" onClick={() => openTriage(call)}>Triar chamado</button></article>)}</div>
    <Modal open={Boolean(selectedCall)} title="Triagem do chamado" ariaLabel="Triagem do chamado" onClose={() => setSelectedCall(null)} size="md"><div className="ditel-triage"><p className="page-eyebrow">{selectedCall?.id.toUpperCase()} · {selectedCall?.unitName}</p><h2>{selectedCall?.subject}</h2><p>Revise os dados encaminhados pela Unidade e registre a decisão operacional.</p><section className="ditel-triage__request"><header><h3>Informações da solicitação</h3><span>{selectedCall?.unitName}</span></header>{loadingDetails ? <LoadingState label="Carregando detalhes do chamado" /> : detailsError ? <section role="alert" className="module-export-status"><span>{detailsError}</span><button type="button" className="button-link" onClick={() => selectedCall && loadCallDetails(selectedCall.id)}>Tentar carregar detalhes novamente</button></section> : <><div><h4>Descrição informada</h4><p>{callDetails?.description ?? 'Descrição não informada.'}</p></div><dl><div><dt>Equipamento relacionado</dt><dd>{equipmentLabel(callDetails)}</dd></div><div><dt>Registrado por</dt><dd>{callDetails?.requestedBy ?? 'Não informado'}</dd></div><div><dt>Abertura</dt><dd>{callDetails?.openedAt ?? 'Não informado'}</dd></div><div><dt>Anexos</dt><dd>{attachmentsLabel(callDetails)}</dd></div></dl></>}</section><label>Seção responsável<select aria-label="Seção responsável" value={triageSection} onChange={(event) => setTriageSection(event.target.value as ResponsibleSection)}><option>Suporte</option><option>Telecom</option></select></label><label>Prioridade<select aria-label="Prioridade" value={triagePriority} onChange={(event) => setTriagePriority(event.target.value as CallPriority)}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Situação<select aria-label="Situação da triagem" value={triageStatus} onChange={(event) => setTriageStatus(event.target.value)}><option>Em análise</option><option>Em atendimento</option><option>Aguardando informação</option><option>Resolvido</option><option>Encerrado</option></select></label>{triageError && <p className="module-export-status" role="alert">{triageError}</p>}{triageRefreshMessage && <p className="module-export-status" role="status">{triageRefreshMessage}</p>}<div className="call-review__actions"><button type="button" className="button-link" onClick={() => setSelectedCall(null)} disabled={triageSubmitting}>Cancelar</button>{triageConflict && <button type="button" className="button-link" onClick={refreshSelectedCall} disabled={triageSubmitting}>Recarregar dados atuais</button>}<button type="button" className="button-link button-link--primary" onClick={saveTriage} disabled={triageSubmitting || (triageConflict && !triageRefreshMessage)}>{triageActionLabel}</button></div><section className="ditel-triage__history"><strong>Histórico</strong><span>Chamado recebido da Unidade · situação atual: {selectedCall?.status}</span>{callDetails?.history.length ? <ol>{callDetails.history.map((entry) => <li key={entry.id}><span>{entry.description}</span><small>{entry.occurredAt}</small></li>)}</ol> : null}</section></div></Modal>
  </section>
}
