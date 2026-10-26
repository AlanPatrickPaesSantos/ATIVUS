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

  return <section className="module-page" aria-labelledby="ac-transfers-title"><header className="module-page__header"><div><p className="page-eyebrow">Custódia AC · baixa imediata</p><h1 id="ac-transfers-title">Transferências AC</h1><p>Distribua bens da AC para uma unidade sem aprovação posterior.</p></div></header>
    {feedback && <p role="status">{feedback}</p>}
    {units.isError && <ErrorState message="Não foi possível carregar unidades ativas autorizadas. Nenhuma lista fixa foi usada." onRetry={() => void units.refetch()} />}
    {canConfirm && <form onSubmit={openConfirmation} className="ac-transfer-form"><label>Unidade de destino<select required value={destination?.id ?? ''} onChange={(event) => setDestination(units.data?.items.find((unit) => unit.id === event.target.value) ?? null)}><option value="">Selecione</option>{units.data?.items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.acronym})</option>)}</select></label><label>Data da distribuição<input required type="date" value={distributedAt} onChange={(event) => setDistributedAt(event.target.value)} /></label><label>Entregador<input required value={deliverer.name} onChange={(event) => setDeliverer({ ...deliverer, name: event.target.value })} /></label><label>Recebedor<input required value={receiver.name} onChange={(event) => setReceiver({ ...receiver, name: event.target.value })} /></label><label>BG (opcional)<input value={bg} onChange={(event) => setBg(event.target.value)} /></label><fieldset><legend>Bens disponíveis na AC</legend>{materials.isLoading ? <p>Carregando estoque...</p> : materials.isError ? <ErrorState message="Não foi possível carregar o estoque AC." onRetry={() => void materials.refetch()} /> : items.length ? items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /> {item.patrimony} — {item.type} {item.model}</label>) : <EmptyState title="Estoque AC vazio" />}</fieldset><button className="button-link button-link--primary" type="submit" disabled={mutation.isPending || !units.data}>Revisar distribuição</button></form>}
    <section><h2>Histórico de transferências</h2><DataTable columns={[{ id: 'date', header: 'Data', cell: (item: AcTransfer) => item.distributedAt }, { id: 'destination', header: 'Destino', cell: (item: AcTransfer) => item.destinationUnit.name }, { id: 'count', header: 'Bens', cell: (item: AcTransfer) => item.materials.length }, { id: 'status', header: 'Estado', cell: (item: AcTransfer) => item.status }, { id: 'documents', header: 'Documentos', cell: (item: AcTransfer) => <span className="ac-transfer-document-actions"><button type="button" aria-label={`Exportar DOCX da transferência ${item.id}`} onClick={(event) => { event.stopPropagation(); void exportTransfer(item.id, 'docx') }}>DOCX</button><button type="button" aria-label={`Exportar PDF da transferência ${item.id}`} onClick={(event) => { event.stopPropagation(); void exportTransfer(item.id, 'pdf') }}>PDF</button></span> }]} data={transfers.data?.items ?? []} rowKey={(item) => item.id} loading={transfers.isLoading} error={transfers.isError ? <ErrorState message="Não foi possível carregar o histórico." onRetry={() => void transfers.refetch()} /> : undefined} empty={<EmptyState title="Nenhuma transferência registrada" />} onRowClick={(item) => setDetailId(item.id)} /></section>
    <Modal open={confirmOpen} title="Confirmar distribuição" onClose={() => setConfirmOpen(false)}><p>Esta confirmação dará baixa imediata de {selectedItems.length} bem(ns) na AC e transferirá a carga para <strong>{destination?.name}</strong>. Não haverá aprovação posterior.</p><ul>{selectedItems.map((item) => <li key={item.id}>{item.patrimony}</li>)}</ul>{mutation.isError && <p role="alert">{errorText(mutation.error)}</p>}<button className="button-link button-link--primary" type="button" disabled={mutation.isPending} onClick={confirm}>{mutation.isPending ? 'Confirmando...' : mutation.isError && !(mutation.error instanceof ApiError) ? 'Repetir com a mesma chave' : 'Confirmar baixa imediata'}</button>{mutation.isError && !(mutation.error instanceof ApiError) && <button className="button-link" type="button" onClick={() => void transfers.refetch()}>Consultar histórico</button>}</Modal>
    <Modal open={Boolean(detailId)} title="Detalhe da transferência" onClose={() => setDetailId(null)}>{detail.isLoading ? <p>Carregando...</p> : detail.data ? <div><p>Destino: {detail.data.destinationUnit.name}</p><p>Bens: {detail.data.materials.length}</p><p>Entregador: {detail.data.deliverer.name}</p><p>Recebedor: {detail.data.receiver.name}</p><div className="ac-transfer-document-actions"><button className="button-link" type="button" onClick={() => void exportDocument('docx')}>Exportar DOCX</button><button className="button-link" type="button" onClick={() => void exportDocument('pdf')}>Exportar PDF</button></div>{documentState && <p role="status">{documentState}</p>}</div> : <ErrorState message="Transferência não encontrada." />}</Modal>
  </section>
}
