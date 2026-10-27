import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { AcTransfer, AcTransferCreateInput, UnitContext } from '../../../shared/api/contracts'
import type { SessionContext } from '../../../shared/auth/types'
import { ApiError } from '../../../shared/api/errors'
import { createAcTransfer, getAcTransferDocument } from '../api/acApi'
import { useAcMaterialsQuery, useAcTransferQuery, useAcTransfersQuery, useInvalidateAcQueries } from '../api/acQueries'
import { getUnits as getAuthorizedUnits } from '../../movements/api/unitsApi'
import { DataTable } from '../../../shared/ui/data/DataTable'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { Modal } from '../../../shared/ui/overlays/Modal'

const errorText = (error: unknown) => error instanceof ApiError ? (error.status === 409 ? 'Conflito: algum bem já foi distribuído ou a chave foi reutilizada com outro conteúdo.' : error.message) : 'Resposta incerta da rede. A chave idempotente foi preservada; tente novamente.'

export function AcTransfersPage({ session }: { session: SessionContext }) {
  const [selected, setSelected] = useState<string[]>([])
  const [destination, setDestination] = useState<UnitContext | null>(null)
  const [distributedAt, setDistributedAt] = useState('')
  const [deliverer, setDeliverer] = useState({ name: '', registration: '' })
  const [receiver, setReceiver] = useState({ name: '', registration: '' })
  const [bg, setBg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [documentState, setDocumentState] = useState<string | null>(null)
  const keyRef = useRef<string | null>(null)
  const materials = useAcMaterialsQuery({ page: 1, pageSize: 100 })
  const units = useQuery({ queryKey: ['units', 'active'], queryFn: getAuthorizedUnits })
  const transfers = useAcTransfersQuery({ page: 1, pageSize: 10 })
  const detail = useAcTransferQuery(detailId)
  const invalidate = useInvalidateAcQueries()
  const mutation = useMutation({ mutationFn: (input: AcTransferCreateInput) => { const key = keyRef.current ?? crypto.randomUUID(); keyRef.current = key; return createAcTransfer(input, key) }, onSuccess: async () => { await invalidate(); keyRef.current = null; setSelected([]); setConfirmOpen(false); setFeedback('Distribuição confirmada. A baixa na AC e a carga da unidade foram atualizadas.') }, onError: (error) => { if (error instanceof ApiError) keyRef.current = null } })
  const canConfirm = session.role === 'ac_operator'
  const items = materials.data?.items ?? []
  const selectedItems = items.filter((item) => selected.includes(item.id))

  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function openConfirmation(event: FormEvent) { event.preventDefault(); setFeedback(null); if (!destination || !selected.length || !distributedAt || !deliverer.name.trim() || !receiver.name.trim()) { setFeedback('Informe destino, bens, data, entregador e recebedor.'); return } setConfirmOpen(true) }
  function confirm() { if (!destination) return; mutation.mutate({ destinationUnit: destination, distributedAt, deliverer, receiver, ...(bg.trim() ? { bg: { number: bg.trim() } } : {}), equipmentIds: selected }) }

  async function exportTransfer(transferId: string, format: 'docx' | 'pdf') {
    setDocumentState(`Preparando ${format.toUpperCase()}...`)
    try {
      const blob = await getAcTransferDocument(transferId, format)
      const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null
      if (url) {
        const link = document.createElement('a')
        link.href = url
        link.download = `termo-transferencia-ac-${transferId}.${format}`
        link.click()
        URL.revokeObjectURL(url)
      }
      setDocumentState(`${format.toUpperCase()} preparado.`)
    } catch {
      setDocumentState(`Não foi possível preparar o ${format.toUpperCase()}.`)
    }
  }

  function exportDocument(format: 'docx' | 'pdf') {
    if (detail.data) void exportTransfer(detail.data.id, format)
  }

  return <section className="module-page ac-transfers-page" aria-labelledby="ac-transfers-title"><header className="module-page__header"><div><p className="page-eyebrow">Custódia AC · baixa imediata</p><h1 id="ac-transfers-title">Transferências AC</h1><p>Distribua bens da AC para uma unidade sem aprovação posterior.</p></div></header>
    {feedback && <p role="status" className="ac-feedback ac-feedback--success">{feedback}</p>}
    {units.isError && <ErrorState message="Não foi possível carregar unidades ativas autorizadas. Nenhuma lista fixa foi usada." onRetry={() => void units.refetch()} />}
    {canConfirm && <form onSubmit={openConfirmation} className="ac-transfer-form"><div className="ac-transfer-form__fields"><label className="ac-field">Unidade de destino<select className="ac-control" required value={destination?.id ?? ''} onChange={(event) => setDestination(units.data?.items.find((unit) => unit.id === event.target.value) ?? null)}><option value="">Selecione</option>{units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.acronym})</option>)}</select></label><label className="ac-field">Data da distribuição<input className="ac-control" required type="date" value={distributedAt} onChange={(event) => setDistributedAt(event.target.value)} /></label><label className="ac-field">Entregador<input className="ac-control" required value={deliverer.name} onChange={(event) => setDeliverer({ ...deliverer, name: event.target.value })} /></label><label className="ac-field">Recebedor<input className="ac-control" required value={receiver.name} onChange={(event) => setReceiver({ ...receiver, name: event.target.value })} /></label><label className="ac-field">BG (opcional)<input className="ac-control" value={bg} onChange={(event) => setBg(event.target.value)} /></label></div><fieldset className="ac-transfer-form__inventory"><legend>Bens disponíveis na AC</legend>{materials.isLoading ? <p className="ac-feedback ac-feedback--loading">Carregando estoque...</p> : materials.isError ? <ErrorState message="Não foi possível carregar o estoque AC." onRetry={() => void materials.refetch()} /> : items.length ? <div className="ac-transfer-form__items">{items.map((item) => <label className="ac-checkbox" key={item.id}><input className="ac-checkbox__input" type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /> <span><strong>{item.patrimony}</strong><small>{item.type} · {item.model}</small></span></label>)}</div> : <EmptyState title="Estoque AC vazio" />}</fieldset><button className="button-link button-link--primary" type="submit" disabled={mutation.isPending || !units.data}>{mutation.isPending ? 'Preparando...' : 'Revisar distribuição'}</button></form>}
    <section className="ac-transfer-history"><header className="ac-transfer-history__header"><div><p className="page-eyebrow">Rastreabilidade patrimonial</p><h2>Histórico de transferências</h2></div><span className="module-total">{transfers.data?.total ?? 0} registros</span></header><div className="ac-transfer-table"><DataTable columns={[{ id: 'date', header: 'Data', cell: (item: AcTransfer) => item.distributedAt }, { id: 'destination', header: 'Destino', cell: (item: AcTransfer) => item.destinationUnit.name }, { id: 'count', header: 'Bens', cell: (item: AcTransfer) => item.materials.length }, { id: 'status', header: 'Estado', cell: (item: AcTransfer) => item.status }, { id: 'documents', header: 'Documentos', cell: (item: AcTransfer) => <span className="ac-transfer-document-actions"><button className="button-link button-link--quiet" type="button" aria-label={`Exportar DOCX da transferência ${item.id}`} onClick={(event) => { event.stopPropagation(); void exportTransfer(item.id, 'docx') }}>DOCX</button><button className="button-link button-link--quiet" type="button" aria-label={`Exportar PDF da transferência ${item.id}`} onClick={(event) => { event.stopPropagation(); void exportTransfer(item.id, 'pdf') }}>PDF</button></span> }]} data={transfers.data?.items ?? []} rowKey={(item) => item.id} loading={transfers.isLoading} error={transfers.isError ? <ErrorState message="Não foi possível carregar o histórico." onRetry={() => void transfers.refetch()} /> : undefined} empty={<EmptyState title="Nenhuma transferência registrada" />} onRowClick={(item) => setDetailId(item.id)} /></div></section>
    <Modal open={confirmOpen} title="Confirmar distribuição" onClose={() => setConfirmOpen(false)}><div className="ac-confirmation"><p>Esta confirmação dará baixa imediata de {selectedItems.length} bem(ns) na AC e transferirá a carga para <strong>{destination?.name}</strong>. Não haverá aprovação posterior.</p><ul>{selectedItems.map((item) => <li key={item.id}>{item.patrimony}</li>)}</ul>{mutation.isError && <p role="alert" className="ac-feedback ac-feedback--error">{errorText(mutation.error)}</p>}<div className="ac-modal-actions"><button className="button-link button-link--primary" type="button" disabled={mutation.isPending} onClick={confirm}>{mutation.isPending ? 'Confirmando...' : mutation.error && !(mutation.error instanceof ApiError) ? 'Repetir com a mesma chave' : 'Confirmar baixa imediata'}</button>{mutation.isError && !(mutation.error instanceof ApiError) && <button className="button-link" type="button" onClick={() => void transfers.refetch()}>Consultar histórico</button>}</div></div></Modal>
    <Modal open={Boolean(detailId)} title="Detalhe da transferência" onClose={() => setDetailId(null)}>{detail.isLoading ? <p className="ac-feedback ac-feedback--loading">Carregando detalhe...</p> : detail.data ? <div className="ac-transfer-detail"><dl><div><dt>Destino</dt><dd>{detail.data.destinationUnit.name}</dd></div><div><dt>Bens</dt><dd>{detail.data.materials.length}</dd></div><div><dt>Entregador</dt><dd>{detail.data.deliverer.name}</dd></div><div><dt>Recebedor</dt><dd>{detail.data.receiver.name}</dd></div></dl><div className="ac-transfer-document-actions"><button className="button-link" type="button" onClick={() => void exportDocument('docx')}>Exportar DOCX</button><button className="button-link" type="button" onClick={() => void exportDocument('pdf')}>Exportar PDF</button></div>{documentState && <p role="status" className="ac-feedback ac-feedback--success">{documentState}</p>}</div> : <ErrorState message="Transferência não encontrada." />}</Modal>
  </section>
}
