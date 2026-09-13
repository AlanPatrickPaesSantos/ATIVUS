import { useEffect, useRef, useState } from 'react'
import { getCallDetails, sectionForCall, type CallDetails, type CallQueueItem } from '../api/callsApi'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'

type CallDetailModalProps = { call: CallQueueItem | null; onClose: () => void }
type DetailTab = 'summary' | 'equipment' | 'history'

export function CallDetailModal({ call, onClose }: CallDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>('summary')
  const [details, setDetails] = useState<CallDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState(false)
  const requestSequence = useRef(0)

  async function loadDetails(callId: string) {
    const sequence = ++requestSequence.current
    setLoadingDetails(true)
    setDetailsError(false)
    try {
      const response = await getCallDetails(callId)
      if (sequence !== requestSequence.current) return
      setDetails(response)
    } catch {
      if (sequence !== requestSequence.current) return
      setDetails(null)
      setDetailsError(true)
    } finally {
      if (sequence === requestSequence.current) setLoadingDetails(false)
    }
  }

  useEffect(() => {
    if (!call) {
      setDetails(null)
      setDetailsError(false)
      setLoadingDetails(false)
      return
    }
    setTab('summary')
    setDetails(null)
    void loadDetails(call.id)
  }, [call?.id])

  if (!call) return null
  const section = details?.section ?? sectionForCall(call)
  const equipment = details?.equipment
  const tabs: Array<[DetailTab, string]> = [['summary', 'Resumo'], ['equipment', 'Equipamentos'], ['history', 'Histórico']]

  return <Modal open title="Detalhes do chamado" onClose={onClose} size="lg" className="call-detail-modal">
    <section className="call-detail"><header><div><p className="page-eyebrow">{call.id.toUpperCase()}</p><h3>{call.subject}</h3></div><dl><div><dt>Prioridade</dt><dd>{details?.priority ?? call.priority}</dd></div><div><dt>Situação</dt><dd>{details?.status ?? call.status}</dd></div><div><dt>Seção</dt><dd>{section}</dd></div></dl></header>{loadingDetails ? <LoadingState label="Carregando detalhes do chamado" /> : detailsError ? <section role="alert" className="module-export-status"><span>Não foi possível carregar os detalhes do chamado.</span><button type="button" className="button-link" onClick={() => { void loadDetails(call.id) }}>Tentar carregar detalhes novamente</button></section> : <><div className="call-detail__tabs" role="tablist" aria-label="Informações do chamado">{tabs.map(([value, label]) => <button type="button" role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>{label}</button>)}</div>{tab === 'summary' ? <section className="call-detail__content"><div className="call-detail__panel"><h4>Descrição</h4><p>{details?.description ?? 'Descrição não informada.'}</p></div><div className="call-detail__panel"><h4>Anexos</h4>{details?.attachments.length ? <ul>{details.attachments.map((attachment) => <li key={attachment.id}><a href={attachment.downloadUrl}>{attachment.name}</a></li>)}</ul> : <p>Nenhum anexo vinculado.</p>}</div></section> : null}{tab === 'equipment' ? <section className="call-detail__content">{equipment ? <div className="call-detail__panel"><h4>Equipamento relacionado</h4><p>{equipment.type} · {equipment.patrimony}</p><p>{equipment.brand} {equipment.model}</p></div> : <div className="call-detail__empty"><h4>Equipamentos relacionados</h4><p>Nenhum equipamento foi associado a este chamado.</p></div>}</section> : null}{tab === 'history' ? <section className="call-detail__content"><h4>Linha do tempo do chamado</h4>{details?.history.length ? <ol className="call-detail__timeline">{details.history.map((entry) => <li key={entry.id}><span>{entry.description}</span><p>{entry.occurredAt}</p></li>)}</ol> : <p>Nenhum histórico registrado.</p>}</section> : null}</>}<footer><span>Consulta disponível apenas para chamados da sua Unidade.</span><button type="button" className="button-link" onClick={onClose}>Fechar</button></footer></section>
  </Modal>
}
