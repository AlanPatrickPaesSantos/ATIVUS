import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionContext } from "../../../shared/auth/types";
import { cancelMovement, createMovement, decideMovement, getMovements, receiveMovement, resolveMovementDivergence, type MovementApiItem } from "../api/movementsApi";
import { getUnits, type UnitOption } from "../api/unitsApi";
import { getOrganizationalFilterOptions } from "../../organizationalStructure/api/organizationalStructureApi";
import { getInventory } from "../../inventory/api/inventoryApi";
import type { EquipmentSummary } from "../../../shared/api/contracts";
import type { AcReturn } from "../../../shared/api/contracts";
import { adaptMovement, type VisualMovement } from "../adapters/movementAdapter";
import { AcReturnPanel } from "../components/AcReturnPanel";
import { MovementRequestModal } from "../components/MovementRequestModal";
import { MovementDecisionModal } from "../components/MovementDecisionModal";
import { MovementOperationsSummary } from "../components/MovementOperationsSummary";

const statusFilters = ["all", "Pendente", "Aguardando recebimento", "Divergência", "Recebida", "Rejeitada", "Cancelada"] as const;
type StatusFilter = typeof statusFilters[number];
const statusLabels: Record<StatusFilter, string> = { all: "Todas as situações", Pendente: "Pendentes", "Aguardando recebimento": "Aguardando recebimento", Divergência: "Divergências", Recebida: "Recebidas", Rejeitada: "Rejeitadas", Cancelada: "Canceladas" };

type PendingMovement = {
  id: string;
  type: "Transferência definitiva" | "Movimentação temporária" | "Retorno";
  equipment: string;
  origin: string;
  originId: string;
  destination: string;
  destinationId: string;
  requestedBy: string;
  requestedAt: string;
  occurredAt: string;
  status: "Pendente" | "Aprovada" | "Aguardando recebimento" | "Recebida" | "Divergência" | "Rejeitada" | "Cancelada";
  divergences: MovementApiItem["divergences"];
  decision?: string;
  updatedAt: string;
};

function pendingFromApi(movement: MovementApiItem): PendingMovement {
  return {
    id: movement.id,
    type: movement.type,
    equipment: movement.equipment?.patrimony ?? movement.equipmentId,
    origin: movement.origin.name,
    originId: movement.origin.id,
    destination: movement.destination.name,
    destinationId: movement.destination.id,
    requestedBy: movement.requestedBy,
    requestedAt: new Date(movement.createdAt).toLocaleString("pt-BR"),
    occurredAt: movement.createdAt,
    status: movement.status,
    divergences: movement.divergences,
    decision: movement.decisionReason ?? undefined,
    updatedAt: movement.updatedAt,
  };
}

export function MovementsPage({ session }: { session: SessionContext }) {
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState(false);
  const [remoteMovements, setRemoteMovements] = useState<VisualMovement[]>([]);
  const [remotePendingMovements, setRemotePendingMovements] = useState<PendingMovement[]>([]);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestStep, setRequestStep] = useState<"form" | "review">("form");
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentSummary[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [movementUnitOptions, setMovementUnitOptions] = useState<UnitOption[]>([]);
  const [movementUnitCatalogLoading, setMovementUnitCatalogLoading] = useState(true);
  const [movementUnitCatalogError, setMovementUnitCatalogError] = useState(false);
  const [movementUnitCatalogRetry, setMovementUnitCatalogRetry] = useState(0);
  const [requestEquipmentId, setRequestEquipmentId] = useState("");
  const [requestUnitId, setRequestUnitId] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestRefreshError, setRequestRefreshError] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [acReturns, setAcReturns] = useState<AcReturn[]>([]);
  const [acReturnsLoading, setAcReturnsLoading] = useState(true);
  const [acReturnsError, setAcReturnsError] = useState<string | null>(null);
  const movementRequestId = useRef(0);
  const movementQuery = useMemo(() => ({
    page,
    pageSize,
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(unitFilter !== "all" ? { unitId: unitFilter } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(periodFrom ? { from: periodFrom } : {}),
    ...(periodTo ? { to: periodTo } : {}),
  }), [page, pageSize, periodFrom, periodTo, search, statusFilter, unitFilter]);
  const loadMovements = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++movementRequestId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await getMovements(movementQuery, signal);
      if (requestId !== movementRequestId.current || signal?.aborted) return false;
      setRemoteMovements(response.items.map(adaptMovement));
      setRemotePendingMovements(response.items.map(pendingFromApi));
      setTotal(response.total ?? response.items.length);
      setTotalPages(response.totalPages ?? 1);
      return true;
    } catch {
      if (signal?.aborted || requestId !== movementRequestId.current) return false;
      setRemoteMovements([]);
      setRemotePendingMovements([]);
      setTotal(0);
      setTotalPages(1);
      setLoadError(true);
      return false;
    } finally {
      if (requestId === movementRequestId.current) setLoading(false);
    }
  }, [movementQuery]);
  useEffect(() => {
    const controller = new AbortController();
    void loadMovements(controller.signal);
    return () => controller.abort();
  }, [loadMovements]);
  useEffect(() => {
    let active = true;
    setMovementUnitCatalogLoading(true);
    setMovementUnitCatalogError(false);
    void getOrganizationalFilterOptions().then((response) => {
      if (!active) return;
      const options = response.units.map((unit) => ({ id: unit.id, name: unit.name, acronym: unit.acronym }));
      setMovementUnitOptions(options);
      if (session.role === "unit_user" && options.length > 0) setUnitFilter((current) => current === "all" ? options[0].id : current);
    }).catch(() => {
      if (!active) return;
      setMovementUnitOptions([]);
      setMovementUnitCatalogError(true);
    }).finally(() => {
      if (active) setMovementUnitCatalogLoading(false);
    });
    return () => { active = false; };
  }, [movementUnitCatalogRetry, session.role]);
  async function openRequest() {
    setRequestOpen(true);
    setRequestStep("form");
    setRequestError(null);
    setRequestRefreshError(false);
    setRequestSuccess(false);
    setRequestEquipmentId("");
    setRequestUnitId("");
    setRequestLoading(true);
    try {
      const [inventory, units] = await Promise.all([getInventory({ situation: "active", page: 1, pageSize: 100 }), getUnits()]);
      setEquipmentOptions(inventory.items);
      setUnitOptions(units.items);
    } catch {
      setRequestError("Não foi possível carregar equipamentos e unidades. Tente novamente.");
    } finally {
      setRequestLoading(false);
    }
  }
  function closeRequest() {
    if (!requestLoading) {
      if (requestRefreshError) setLoadError(true);
      setRequestOpen(false);
    }
  }
  async function submitRequest() {
    const equipment = equipmentOptions.find((item) => item.id === requestEquipmentId);
    const destination = unitOptions.find((item) => item.id === requestUnitId);
    if (!equipment || !destination) {
      setRequestError("Selecione um equipamento e uma unidade destino.");
      return;
    }
    setRequestLoading(true);
    setRequestError(null);
    try {
      await createMovement({ equipmentId: equipment.id, destination });
      setRequestSuccess(true);
      if (!(await loadMovements())) setRequestRefreshError(true);
    } catch (error) {
      const code = (error as { status?: number }).status;
      setRequestError(code === 400 ? "Revise os dados da solicitação." : code === 403 ? "Você não tem permissão para solicitar transferências." : code === 404 ? "O equipamento ou destino não foi encontrado." : code === 409 ? "Este equipamento já possui uma solicitação ou foi alterado. Atualize os dados e tente novamente." : "Não foi possível registrar a solicitação.");
    } finally {
      setRequestLoading(false);
    }
  }
  const movements = remoteMovements;
  const filteredMovements = remotePendingMovements;
  const filteredAcReturns = useMemo(() => acReturns.filter((item) => {
    const date = new Date(item.createdAt);
    const text = `${item.equipment?.patrimony ?? item.equipmentId} ${item.origin.name}`.toLocaleLowerCase();
    return (statusFilter === "all" || item.status === statusFilter) && (unitFilter === "all" || item.origin.id === unitFilter) && (!search.trim() || text.includes(search.trim().toLocaleLowerCase())) && (!periodFrom || date >= new Date(`${periodFrom}T00:00:00`)) && (!periodTo || date <= new Date(`${periodTo}T23:59:59.999`));
  }), [acReturns, search, statusFilter, unitFilter, periodFrom, periodTo]);
  const unitOptionsForFilter = movementUnitOptions;
  const onAcReturnStateChange = useCallback((items: AcReturn[], isLoading: boolean, error: string | null) => { setAcReturns(items); setAcReturnsLoading(isLoading); setAcReturnsError(error); }, []);
  const canObserveAcReturns = session.role === "unit_user" || session.role === "ac_operator" || session.role === "ditel_admin";
  const selectedMovement = remotePendingMovements.find((movement) => movement.id === selectedMovementId) ?? null;
  useEffect(() => {
    if (rejectionError && selectedMovement?.status === "Pendente") setDecisionError("Informe uma justificativa para rejeitar a solicitação.");
  }, [rejectionError, selectedMovement]);

  function closeReview() {
    if (decisionLoading) return;
    setSelectedMovementId(null);
    setRejectionReason("");
    setRejectionError(false);
    setDecisionError(null);
  }
  async function decideMovementAction(status: "Aprovada" | "Rejeitada") {
    if (!selectedMovement) return;
    if (status === "Rejeitada" && !rejectionReason.trim()) {
      setRejectionError(true);
      return;
    }
    setDecisionLoading(true);
    setDecisionError(null);
    try {
      await decideMovement(selectedMovement.id, {
        status,
        updatedAt: selectedMovement.updatedAt,
        ...(status === "Rejeitada" ? { reason: rejectionReason.trim() } : {}),
      });
      await loadMovements();
      setSelectedMovementId(null);
      setRejectionReason("");
    } catch (error) {
      const statusCode = (error as { status?: number }).status;
      setDecisionError(statusCode === 409 ? "A solicitação foi alterada por outra pessoa. A fila foi atualizada." : statusCode === 400 ? "Revise os dados da decisão." : statusCode === 403 ? "Você não tem permissão para decidir esta solicitação." : statusCode === 404 ? "A solicitação não foi encontrada." : "Não foi possível salvar a decisão.");
      if (statusCode === 409) {
        void loadMovements();
      }
    } finally {
      setDecisionLoading(false);
    }
  }
  async function receiveMovementAction(status: "Recebida" | "Divergência") {
    if (!selectedMovement) return;
    const description = rejectionReason.trim();
    if (status === "Divergência" && !description) {
      setRejectionError(true);
      return;
    }
    setDecisionLoading(true);
    setDecisionError(null);
    try {
      await receiveMovement(selectedMovement.id, {
        status,
        updatedAt: selectedMovement.updatedAt,
        ...(description ? { description } : {}),
      });
      await loadMovements();
      closeReview();
    } catch {
      setDecisionError("Não foi possível registrar o recebimento. Atualize os dados e tente novamente.");
    } finally {
      setDecisionLoading(false);
    }
  }
  async function resolveMovementAction(action: "retomar" | "rejeitar") {
    if (!selectedMovement || !rejectionReason.trim()) {
      setRejectionError(true);
      return;
    }
    setDecisionLoading(true);
    setDecisionError(null);
    try {
      await resolveMovementDivergence(selectedMovement.id, {
        action,
        updatedAt: selectedMovement.updatedAt,
        resolution: rejectionReason.trim(),
      });
      await loadMovements();
      closeReview();
    } catch {
      setDecisionError("Não foi possível resolver a divergência.");
    } finally {
      setDecisionLoading(false);
    }
  }
  async function cancelMovementAction() {
    if (!selectedMovement || !rejectionReason.trim()) {
      setRejectionError(true);
      return;
    }
    setDecisionLoading(true);
    setDecisionError(null);
    try {
      await cancelMovement(selectedMovement.id, { updatedAt: selectedMovement.updatedAt, reason: rejectionReason.trim() });
      await loadMovements();
      closeReview();
    } catch {
      setDecisionError("Não foi possível cancelar a solicitação. Ela pode já ter sido decidida.");
    } finally {
      setDecisionLoading(false);
    }
  }

  return (
    <section className="module-page movements-page" data-testid="movements-operation-log" data-visual-variant="operational-movement-log" aria-labelledby="movements-title">
      <header className="module-page__header">
        <div>
          <p className="page-eyebrow">Rastreabilidade patrimonial · {session.role === "ditel_admin" ? "escopo estadual" : session.unit?.name}</p>
          <h1 id="movements-title">Histórico de movimentações</h1>
          <p>Consulte transferências definitivas no escopo autorizado.</p>
        </div>
        <div>
          {session.role === "unit_user" && (
            <button className="button-link button-link--primary" type="button" onClick={openRequest}>
              Solicitar transferência
            </button>
          )}
          <span className="module-total">
            {total} {total === 1 ? "registro" : "registros"}
          </span>
        </div>
      </header>
      <MovementOperationsSummary movements={filteredMovements} acReturns={filteredAcReturns} loading={loading || (canObserveAcReturns && acReturnsLoading)} error={loadError ? "Não foi possível carregar as movimentações." : acReturnsError} />
      {session.role === "ditel_admin" && (
        <section className="movement-review-queue module-panel" aria-labelledby="pending-movements-title">
          <header>
            <div>
              <p className="page-eyebrow">Decisão administrativa</p>
              <h2 id="pending-movements-title">Solicitações pendentes</h2>
              <p>Aprove ou rejeite a movimentação antes de alterar o vínculo patrimonial.</p>
            </div>
            <span>{filteredMovements.filter((movement) => movement.status === "Pendente").length} pendentes</span>
          </header>
          <div className="movement-review-queue__list">
            {filteredMovements.map((movement) => (
              <article key={movement.id} className={`movement-review-queue__item movement-review-queue__item--${movement.status.toLocaleLowerCase()}`}>
                <div>
                  <span>{movement.type}</span>
                  <h3>{movement.equipment}</h3>
                  <p>
                    {movement.origin} <b aria-hidden="true">→</b> {movement.destination}
                  </p>
                </div>
                <div>
                  <small>
                    Solicitada por {movement.requestedBy} · {movement.requestedAt}
                  </small>
                  {movement.status === "Pendente" ? (
                    <button
                      className="button-link button-link--quiet"
                      type="button"
                      aria-label={`Analisar solicitação ${movement.id}`}
                      onClick={() => {
                        setDecisionError(null);
                        setSelectedMovementId(movement.id);
                      }}
                    >
                      Analisar
                    </button>
                  ) : (
                    <strong>{movement.status}</strong>
                  )}
                  {movement.decision && <p className="movement-review-queue__decision">{movement.decision}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {session.role === "unit_user" && (
        <section className="movement-review-queue module-panel" aria-labelledby="receipt-movements-title">
          <header>
            <div>
              <p className="page-eyebrow">Recebimento formal</p>
              <h2 id="receipt-movements-title">Movimentações patrimoniais da unidade</h2>
              <p>Confirme a chegada, registre uma divergência ou cancele uma solicitação pendente.</p>
            </div>
          </header>
          <div className="movement-review-queue__list">
            {filteredMovements
              .filter((movement) => movement.status === "Pendente" || movement.status === "Aguardando recebimento" || movement.status === "Divergência")
              .map((movement) => (
                <article key={movement.id} className="movement-review-queue__item">
                  <div>
                    <h3>{movement.equipment}</h3>
                    <p>
                      {movement.origin} <b aria-hidden="true">→</b> {movement.destination}
                    </p>
                  </div>
                  <button
                    className="button-link button-link--quiet"
                    type="button"
                    onClick={() => {
                      setDecisionError(null);
                      setSelectedMovementId(movement.id);
                    }}
                  >
                    {movement.status === "Pendente" ? "Cancelar" : movement.status === "Divergência" ? "Resolver divergência" : "Receber"}
                  </button>
                </article>
              ))}
          </div>
        </section>
      )}
      <AcReturnPanel session={session} onStateChange={onAcReturnStateChange} />
      <section className="module-panel movement-filters" aria-label="Filtros de movimentação">
        <label>
          Buscar movimentação
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Equipamento, origem ou destino" />
        </label>
        <label className="movement-filters__select">
          Situação
          <select aria-label="Situação da movimentação" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1); }}>
            {statusFilters.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label className="movement-filters__select">
          Unidade
          <select aria-label="Unidade da movimentação" value={unitFilter} onChange={(event) => { setUnitFilter(event.target.value); setPage(1); }}>
            {session.role !== "unit_user" ? <option value="all">Todas as unidades</option> : null}
            {unitOptionsForFilter.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}
          </select>
          {movementUnitCatalogLoading ? <span role="status">Carregando unidades…</span> : null}
          {movementUnitCatalogError ? <span role="alert">Não foi possível carregar as unidades.</span> : null}
          {!movementUnitCatalogLoading && !movementUnitCatalogError && unitOptionsForFilter.length === 0 ? <span>Não há unidades disponíveis.</span> : null}
          {movementUnitCatalogError ? <button type="button" aria-label="Tentar novamente unidades" onClick={() => setMovementUnitCatalogRetry((value) => value + 1)}>Tentar novamente</button> : null}
        </label>
        <label>
          Período inicial
          <input aria-label="Período inicial" type="date" value={periodFrom} onChange={(event) => { setPeriodFrom(event.target.value); setPage(1); }} />
        </label>
        <label>
          Período final
          <input aria-label="Período final" type="date" value={periodTo} onChange={(event) => { setPeriodTo(event.target.value); setPage(1); }} />
        </label>
      </section>
      {loading && (
        <section className="module-panel movement-empty" role="status">
          Carregando movimentações…
        </section>
      )}
      {loadError && (
        <section className="module-panel movement-empty" role="alert">
          <strong>Não foi possível carregar as transferências.</strong>
          <button
            type="button"
            onClick={() => {
              void loadMovements();
            }}
          >
            Tentar novamente
          </button>
        </section>
      )}
      <div className="movement-list" aria-live="polite">
        {!loading &&
          !loadError &&
          (movements.length ? (
            movements.map((movement, index) => (
              <article key={movement.id} className="module-panel movement-item" style={{ "--movement-index": index } as React.CSSProperties}>
                <div className="movement-item__summary">
                  <span className={`movement-kind movement-kind--${movement.type}`}>Transferência</span>
                  <h2>{movement.title}</h2>
                  <p>{movement.equipment}</p>
                </div>
                <div className="movement-item__route" aria-label={`Percurso: ${movement.origin} para ${movement.destination}`}>
                  <div>
                    <span>Origem</span>
                    <strong>{movement.origin}</strong>
                  </div>
                  <span className="movement-item__arrow" aria-hidden="true">
                    →
                  </span>
                  <div>
                    <span>Destino</span>
                    <strong>{movement.destination}</strong>
                  </div>
                </div>
                <dl className="movement-item__meta">
                  <div>
                    <dt>Registrado por</dt>
                    <dd>{movement.responsible}</dd>
                    <dd>{movement.date}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <section className="module-panel movement-empty">
              <strong>Nenhuma movimentação encontrada</strong>
              <span>Ajuste os filtros para consultar outro período ou tipo.</span>
            </section>
          ))}
      </div>
      {!loading && !loadError && totalPages > 1 && (
        <nav className="module-panel movement-pagination" aria-label="Paginação de movimentações">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Próxima</button>
        </nav>
      )}
      <MovementDecisionModal movement={selectedMovement} session={session} reason={rejectionReason} reasonError={rejectionError} decisionError={decisionError} loading={decisionLoading} onClose={closeReview} onReasonChange={(value) => { setRejectionReason(value); setRejectionError(false); }} onDecide={decideMovementAction} onReceive={receiveMovementAction} onResolve={resolveMovementAction} onCancel={cancelMovementAction} />
      <MovementRequestModal open={requestOpen} success={requestSuccess} step={requestStep} error={requestError} loading={requestLoading} equipmentOptions={equipmentOptions} unitOptions={unitOptions} equipmentId={requestEquipmentId} unitId={requestUnitId} onClose={closeRequest} onRetry={openRequest} onEquipmentChange={setRequestEquipmentId} onUnitChange={setRequestUnitId} onStepChange={setRequestStep} onSubmit={submitRequest} />
    </section>
  );
}
