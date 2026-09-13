import { useEffect, useMemo, useState } from 'react'
import type { SessionContext } from '../../../shared/auth/types'
import { movementFixture, type MovementKind } from '../../../shared/fixtures/moduleFixtures'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { createMovement, decideMovement, getMovements, type MovementApiItem } from '../api/movementsApi'
import { getUnits, type UnitOption } from '../api/unitsApi'
import { getInventory } from '../../inventory/api/inventoryApi'
import type { EquipmentSummary } from '../../../shared/api/contracts'
import { adaptMovement, type VisualMovement } from '../adapters/movementAdapter'

const labels: Record<MovementKind, string> = { transferencia: 'Transferência', baixa: 'Baixa', alocacao: 'Alocação' }
const movementFilters: Array<{ value: 'all' | MovementKind; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'alocacao', label: 'Alocação' },
  { value: 'baixa', label: 'Baixa' },
]

type PendingMovement = {
  id: string
  type: 'Transferência definitiva' | 'Movimentação temporária' | 'Retorno'
  equipment: string
  origin: string
  destination: string
  requestedBy: string
  requestedAt: string
  status: 'Pendente' | 'Aprovada' | 'Rejeitada'
  decision?: string
  updatedAt: string
}

function pendingFromApi(movement: MovementApiItem): PendingMovement {
  return { id: movement.id, type: movement.type, equipment: movement.equipmentId, origin: movement.origin.name, destination: movement.destination.name, requestedBy: movement.requestedBy, requestedAt: new Date(movement.createdAt).toLocaleString('pt-BR'), status: movement.status, decision: movement.decisionReason ?? undefined, updatedAt: movement.updatedAt }
}

export function MovementsPage({ session }: { session: SessionContext }) {
  const [kind, setKind] = useState<'all' | MovementKind>('all')
  const [search, setSearch] = useState('')
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionError, setRejectionError] = useState(false)
  const [remoteMovements, setRemoteMovements] = useState<VisualMovement[]>([])
  const [remotePendingMovements, setRemotePendingMovements] = useState<PendingMovement[]>([])
  const [decisionLoading, setDecisionLoading] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestStep, setRequestStep] = useState<'form' | 'review'>('form')
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentSummary[]>([])
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([])
  const [requestEquipmentId, setRequestEquipmentId] = useState('')
  const [requestUnitId, setRequestUnitId] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestRefreshError, setRequestRefreshError] = useState(false)
  const [requestSuccess, setRequestSuccess] = useState(false)
  const loadMovements = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await getMovements()
      setRemoteMovements(response.items.map(adaptMovement))
      setRemotePendingMovements(response.items.map(pendingFromApi))
      return true
    } catch {
      setRemoteMovements([])
      setRemotePendingMovements([])
      setLoadError(true)
      return false
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadMovements() }, [])
  async function openRequest() {
    setRequestOpen(true); setRequestStep('form'); setRequestError(null); setRequestRefreshError(false); setRequestSuccess(false); setRequestEquipmentId(''); setRequestUnitId(''); setRequestLoading(true)
    try { const [inventory, units] = await Promise.all([getInventory({ situation: 'active', page: 1, pageSize: 100 }), getUnits()]); setEquipmentOptions(inventory.items); setUnitOptions(units.items) } catch { setRequestError('Não foi possível carregar equipamentos e unidades. Tente novamente.') } finally { setRequestLoading(false) }
  }
  function closeRequest() { if (!requestLoading) { if (requestRefreshError) setLoadError(true); setRequestOpen(false) } }
  async function submitRequest() {
    const equipment = equipmentOptions.find((item) => item.id === requestEquipmentId); const destination = unitOptions.find((item) => item.id === requestUnitId)
    if (!equipment || !destination) { setRequestError('Selecione um equipamento e uma unidade destino.'); return }
    setRequestLoading(true); setRequestError(null)
    try { await createMovement({ equipmentId: equipment.id, destination }); setRequestSuccess(true); if (!await loadMovements()) setRequestRefreshError(true) } catch (error) { const code = (error as { status?: number }).status; setRequestError(code === 400 ? 'Revise os dados da solicitação.' : code === 403 ? 'Você não tem permissão para solicitar transferências.' : code === 404 ? 'O equipamento ou destino não foi encontrado.' : code === 409 ? 'Este equipamento já possui uma solicitação ou foi alterado. Atualize os dados e tente novamente.' : 'Não foi possível registrar a solicitação.') } finally { setRequestLoading(false) }
  }
  const includeFixtureMovements = import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW === 'true'
  const movements = useMemo(() => [...remoteMovements, ...(includeFixtureMovements ? movementFixture.filter((movement) => movement.type !== 'transferencia') : [])].filter((movement) => (session.role === 'ditel_admin' || movement.unitId === session.unit?.id) && (kind === 'all' || movement.type === kind) && `${movement.title} ${movement.equipment} ${movement.origin} ${movement.destination}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [kind, search, session.role, session.unit?.id, remoteMovements, includeFixtureMovements])
  const selectedMovement = remotePendingMovements.find((movement) => movement.id === selectedMovementId) ?? null

  function closeReview() { if (decisionLoading) return; setSelectedMovementId(null); setRejectionReason(''); setRejectionError(false); setDecisionError(null) }
  async function decideMovementAction(status: 'Aprovada' | 'Rejeitada') {
    if (!selectedMovement) return
    if (status === 'Rejeitada' && !rejectionReason.trim()) { setRejectionError(true); return }
    setDecisionLoading(true); setDecisionError(null)
    try { await decideMovement(selectedMovement.id, { status, updatedAt: selectedMovement.updatedAt, ...(status === 'Rejeitada' ? { reason: rejectionReason.trim() } : {}) }); await loadMovements(); setSelectedMovementId(null); setRejectionReason('') } catch (error) { const statusCode = (error as { status?: number }).status; setDecisionError(statusCode === 409 ? 'A solicitação foi alterada por outra pessoa. A fila foi atualizada.' : statusCode === 400 ? 'Revise os dados da decisão.' : statusCode === 403 ? 'Você não tem permissão para decidir esta solicitação.' : statusCode === 404 ? 'A solicitação não foi encontrada.' : 'Não foi possível salvar a decisão.') ; if (statusCode === 409) { void loadMovements() } } finally { setDecisionLoading(false) }
  }

  return <section className="module-page movements-page" data-testid="movements-operation-log" data-visual-variant="operational-movement-log" aria-labelledby="movements-title">
    <header className="module-page__header"><div><p className="page-eyebrow">Rastreabilidade patrimonial · {session.role === 'ditel_admin' ? 'escopo estadual' : session.unit?.name}</p><h1 id="movements-title">Histórico de movimentações</h1><p>Consulte eventos recentes de transferência, alocação e baixa no escopo autorizado.</p></div><div>{session.role === 'unit_user' && <button className="button-link button-link--primary" type="button" onClick={openRequest}>Solicitar transferência</button>}<span className="module-total">{movements.length} {movements.length === 1 ? 'registro' : 'registros'}</span></div></header>
    {session.role === 'ditel_admin' && <section className="movement-review-queue module-panel" aria-labelledby="pending-movements-title"><header><div><p className="page-eyebrow">Decisão administrativa</p><h2 id="pending-movements-title">Solicitações pendentes</h2><p>Aprove ou rejeite a movimentação antes de alterar o vínculo patrimonial.</p></div><span>{remotePendingMovements.filter((movement) => movement.status === 'Pendente').length} pendentes</span></header><div className="movement-review-queue__list">{remotePendingMovements.map((movement) => <article key={movement.id} className={`movement-review-queue__item movement-review-queue__item--${movement.status.toLocaleLowerCase()}`}><div><span>{movement.type}</span><h3>{movement.equipment}</h3><p>{movement.origin} <b aria-hidden="true">→</b> {movement.destination}</p></div><div><small>Solicitada por {movement.requestedBy} · {movement.requestedAt}</small>{movement.status === 'Pendente' ? <button className="button-link button-link--quiet" type="button" aria-label={`Analisar solicitação ${movement.id}`} onClick={() => { setDecisionError(null); setSelectedMovementId(movement.id) }}>Analisar</button> : <strong>{movement.status}</strong>}{movement.decision && <p className="movement-review-queue__decision">{movement.decision}</p>}</div></article>)}</div></section>}
    <section className="module-panel movement-filters" aria-label="Filtros de movimentação"><label>Buscar movimentação<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Equipamento, origem ou destino" /></label><div className="movement-filter-chips" role="group" aria-label="Filtrar por tipo">{movementFilters.map((filter) => <button type="button" className={kind === filter.value ? 'is-active' : ''} aria-pressed={kind === filter.value} key={filter.value} onClick={() => setKind(filter.value)}>{filter.label}</button>)}</div><label className="movement-filters__select">Tipo de movimentação<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>{movementFilters.map((filter) => <option value={filter.value} key={filter.value}>{filter.value === 'all' ? 'Todos os tipos' : filter.label}</option>)}</select></label></section>
    {loading && <section className="module-panel movement-empty" role="status">Carregando movimentações…</section>}{loadError && <section className="module-panel movement-empty" role="alert"><strong>Não foi possível carregar as transferências.</strong><button type="button" onClick={() => { void loadMovements() }}>Tentar novamente</button></section>}<div className="movement-list" aria-live="polite">{!loading && !loadError && (movements.length ? movements.map((movement, index) => <article key={movement.id} className="module-panel movement-item" style={{ '--movement-index': index } as React.CSSProperties}><div className="movement-item__summary"><span className={`movement-kind movement-kind--${movement.type}`}>{labels[movement.type]}</span><h2>{movement.title}</h2><p>{movement.equipment}</p></div><div className="movement-item__route" aria-label={`Percurso: ${movement.origin} para ${movement.destination}`}><div><span>Origem</span><strong>{movement.origin}</strong></div><span className="movement-item__arrow" aria-hidden="true">→</span><div><span>Destino</span><strong>{movement.destination}</strong></div></div><dl className="movement-item__meta"><div><dt>Registrado por</dt><dd>{movement.responsible}</dd><dd>{movement.date}</dd></div></dl></article>) : <section className="module-panel movement-empty"><strong>Nenhuma movimentação encontrada</strong><span>Ajuste os filtros para consultar outro período ou tipo.</span></section>)}</div>
    <Modal open={Boolean(selectedMovement)} title="Analisar movimentação" ariaLabel="Analisar movimentação" size="lg" onClose={closeReview}>{selectedMovement && <div className="movement-review-dialog"><header><div><p className="page-eyebrow">{selectedMovement.id.toUpperCase()} · {selectedMovement.type}</p><h2>{selectedMovement.equipment}</h2></div><span>{selectedMovement.status}</span></header><div className="movement-review-dialog__route"><div><small>Origem</small><strong>{selectedMovement.origin}</strong></div><b aria-hidden="true">→</b><div><small>Destino</small><strong>{selectedMovement.destination}</strong></div></div><section><h3>Solicitação da Unidade</h3><dl><div><dt>Registrada por</dt><dd>{selectedMovement.requestedBy}</dd></div><div><dt>Data</dt><dd>{selectedMovement.requestedAt}</dd></div><div><dt>Impacto</dt><dd>O vínculo patrimonial será atualizado somente após a confirmação do backend.</dd></div></dl></section><label>Justificativa da rejeição<textarea disabled={decisionLoading} value={rejectionReason} onChange={(event) => { setRejectionReason(event.target.value); setRejectionError(false) }} placeholder="Obrigatória apenas se a solicitação for rejeitada." /></label>{rejectionError && <p className="movement-review-dialog__error" role="alert">Informe uma justificativa para rejeitar a solicitação.</p>}{decisionError && <p className="movement-review-dialog__error" role="alert">{decisionError}</p>}<footer><button className="button-link" type="button" disabled={decisionLoading} onClick={closeReview}>Cancelar</button><button className="button-link button-link--danger" disabled={decisionLoading} type="button" onClick={() => decideMovementAction('Rejeitada')}>{decisionLoading ? 'Salvando…' : 'Rejeitar movimentação'}</button><button className="button-link button-link--primary" disabled={decisionLoading} type="button" onClick={() => decideMovementAction('Aprovada')}>{decisionLoading ? 'Salvando…' : 'Aprovar movimentação'}</button></footer></div>}</Modal>
    <Modal open={requestOpen} title="Solicitar transferência" ariaLabel="Solicitar transferência" size="lg" onClose={closeRequest}>{requestSuccess ? <div><h2>Solicitação registrada</h2><p role="status">A solicitação foi registrada e aguarda decisão DITEL.</p><button className="button-link button-link--primary" type="button" onClick={closeRequest}>Concluir</button></div> : <div className="movement-review-dialog"><h2>{requestStep === 'form' ? 'Nova transferência' : 'Revisar transferência'}</h2>{requestError && <p className="movement-review-dialog__error" role="alert">{requestError}</p>}{requestError && <button className="button-link" type="button" onClick={openRequest} disabled={requestLoading}>Tentar novamente</button>}{requestLoading && <p role="status">Carregando…</p>}{!requestLoading && requestStep === 'form' && <><label>Equipamento<select aria-label="Equipamento" value={requestEquipmentId} onChange={(event) => setRequestEquipmentId(event.target.value)}><option value="">Selecione um equipamento ativo</option>{equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.patrimony} · {item.type} · {item.model}</option>)}</select></label><label>Unidade destino<select aria-label="Unidade destino" value={requestUnitId} onChange={(event) => setRequestUnitId(event.target.value)}><option value="">Selecione uma unidade</option>{unitOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.acronym})</option>)}</select></label><footer><button className="button-link" type="button" onClick={closeRequest}>Cancelar</button><button className="button-link button-link--primary" type="button" disabled={!requestEquipmentId || !requestUnitId} onClick={() => setRequestStep('review')}>Revisar solicitação</button></footer></>}{!requestLoading && requestStep === 'review' && <><p>{equipmentOptions.find((item) => item.id === requestEquipmentId)?.patrimony} → {unitOptions.find((item) => item.id === requestUnitId)?.name}</p><footer><button className="button-link" type="button" onClick={() => setRequestStep('form')}>Voltar</button><button className="button-link button-link--primary" type="button" disabled={requestLoading} onClick={submitRequest}>Confirmar solicitação</button></footer></>}</div>}</Modal>
  </section>
}
