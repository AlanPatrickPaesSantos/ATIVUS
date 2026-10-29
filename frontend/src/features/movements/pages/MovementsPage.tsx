import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionContext } from "../../../shared/auth/types";
import { movementFixture, type MovementKind } from "../../../shared/fixtures/moduleFixtures";
import { cancelMovement, createMovement, decideMovement, getMovements, receiveMovement, resolveMovementDivergence, type MovementApiItem } from "../api/movementsApi";
import { getUnits, type UnitOption } from "../api/unitsApi";
import { getInventory } from "../../inventory/api/inventoryApi";
import type { EquipmentSummary } from "../../../shared/api/contracts";
import type { AcReturn } from "../../../shared/api/contracts";
import { adaptMovement, type VisualMovement } from "../adapters/movementAdapter";
import { AcReturnPanel } from "../components/AcReturnPanel";
import { MovementRequestModal } from "../components/MovementRequestModal";
import { MovementDecisionModal } from "../components/MovementDecisionModal";
import { MovementOperationsSummary } from "../components/MovementOperationsSummary";

const labels: Record<MovementKind, string> = {
  transferencia: "Transferência",
  baixa: "Baixa",
  alocacao: "Alocação",
};
const movementFilters: Array<{ value: "all" | MovementKind; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "transferencia", label: "Transferência" },
  { value: "alocacao", label: "Alocação" },
  { value: "baixa", label: "Baixa" },
];
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
  const [kind, setKind] = useState<"all" | MovementKind>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
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
  const [requestEquipmentId, setRequestEquipmentId] = useState("");
  const [requestUnitId, setRequestUnitId] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestRefreshError, setRequestRefreshError] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [acReturns, setAcReturns] = useState<AcReturn[]>([]);
  const [acReturnsLoading, setAcReturnsLoading] = useState(true);
  const [acReturnsError, setAcReturnsError] = useState<string | null>(null);
  const loadMovements = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await getMovements();
      setRemoteMovements(response.items.map(adaptMovement));
      setRemotePendingMovements(response.items.map(pendingFromApi));
      return true;
    } catch {
      setRemoteMovements([]);
      setRemotePendingMovements([]);
      setLoadError(true);
      return false;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadMovements();
  }, []);
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
  const includeFixtureMovements = import.meta.env.DEV && import.meta.env.VITE_ENABLE_MSW === "true";
  const matchesFilter = (movement: VisualMovement) => {
    const query = search.trim().toLocaleLowerCase();
    const date = movement.occurredAt ? new Date(movement.occurredAt) : null;
    return (session.role === "ditel_admin" || movement.unitId === session.unit?.id) &&
      (kind === "all" || movement.type === kind) &&
      (statusFilter === "all" || movement.status === statusFilter) &&
      (unitFilter === "all" || movement.unitId === unitFilter || movement.destinationId === unitFilter) &&
      (!query || `${movement.title} ${movement.equipment} ${movement.origin} ${movement.destination}`.toLocaleLowerCase().includes(query)) &&
      (!periodFrom || !date || date >= new Date(`${periodFrom}T00:00:00`)) &&
      (!periodTo || !date || date <= new Date(`${periodTo}T23:59:59.999`));
  };
  const movements = useMemo(() => [...remoteMovements, ...(includeFixtureMovements ? movementFixture.filter((movement) => movement.type !== "transferencia") : [])].filter(matchesFilter), [kind, search, statusFilter, unitFilter, periodFrom, periodTo, session.role, session.unit?.id, remoteMovements, includeFixtureMovements]);
  const filteredMovements = useMemo(() => remotePendingMovements.filter((movement) => {
    const date = new Date(movement.occurredAt);
    const query = search.trim().toLocaleLowerCase();
    return (statusFilter === "all" || movement.status === statusFilter) &&
      (unitFilter === "all" || movement.originId === unitFilter || movement.destinationId === unitFilter) &&
      (!query || `${movement.equipment} ${movement.origin} ${movement.destination}`.toLocaleLowerCase().includes(query)) &&
      (!periodFrom || date >= new Date(`${periodFrom}T00:00:00`)) && (!periodTo || date <= new Date(`${periodTo}T23:59:59.999`));
  }), [remotePendingMovements, search, statusFilter, unitFilter, periodFrom, periodTo]);
  const filteredAcReturns = useMemo(() => acReturns.filter((item) => {
    const date = new Date(item.createdAt);
    const text = `${item.equipment?.patrimony ?? item.equipmentId} ${item.origin.name}`.toLocaleLowerCase();
    return (statusFilter === "all" || item.status === statusFilter) && (unitFilter === "all" || item.origin.id === unitFilter) && (!search.trim() || text.includes(search.trim().toLocaleLowerCase())) && (!periodFrom || date >= new Date(`${periodFrom}T00:00:00`)) && (!periodTo || date <= new Date(`${periodTo}T23:59:59.999`));
  }), [acReturns, search, statusFilter, unitFilter, periodFrom, periodTo]);
  const unitOptionsForFilter = useMemo(() => [...new Map([...remotePendingMovements.flatMap((item) => [{ id: item.originId, name: item.origin }, { id: item.destinationId, name: item.destination }]), ...acReturns.map((item) => ({ id: item.origin.id, name: item.origin.name }))].map((item) => [item.id, item])).values()], [remotePendingMovements, acReturns]);
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
          <p>Consulte eventos recentes de transferência, alocação e baixa no escopo autorizado.</p>
        </div>
        <div>
          {session.role === "unit_user" && (
            <button className="button-link button-link--primary" type="button" onClick={openRequest}>
              Solicitar transferência
            </button>
          )}
          <span className="module-total">
            {movements.length} {movements.length === 1 ? "registro" : "registros"}
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
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Equipamento, origem ou destino" />
        </label>
        <div className="movement-filter-chips" role="group" aria-label="Filtrar por tipo">
          {movementFilters.map((filter) => (
            <button type="button" className={kind === filter.value ? "is-active" : ""} aria-pressed={kind === filter.value} key={filter.value} onClick={() => setKind(filter.value)}>
              {filter.label}
            </button>
          ))}
        </div>
        <label className="movement-filters__select">
          Tipo de movimentação
          <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            {movementFilters.map((filter) => (
              <option value={filter.value} key={filter.value}>
                {filter.value === "all" ? "Todos os tipos" : filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="movement-filters__select">
          Situação
          <select aria-label="Situação da movimentação" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            {statusFilters.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label className="movement-filters__select">
          Unidade
          <select aria-label="Unidade da movimentação" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
            <option value="all">Todas as unidades</option>
            {unitOptionsForFilter.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}
          </select>
        </label>
        <label>
          Período inicial
          <input aria-label="Período inicial" type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
        </label>
        <label>
          Período final
          <input aria-label="Período final" type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
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
                  <span className={`movement-kind movement-kind--${movement.type}`}>{labels[movement.type]}</span>
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
      <MovementDecisionModal movement={selectedMovement} session={session} reason={rejectionReason} reasonError={rejectionError} decisionError={decisionError} loading={decisionLoading} onClose={closeReview} onReasonChange={(value) => { setRejectionReason(value); setRejectionError(false); }} onDecide={decideMovementAction} onReceive={receiveMovementAction} onResolve={resolveMovementAction} onCancel={cancelMovementAction} />
      <MovementRequestModal open={requestOpen} success={requestSuccess} step={requestStep} error={requestError} loading={requestLoading} equipmentOptions={equipmentOptions} unitOptions={unitOptions} equipmentId={requestEquipmentId} unitId={requestUnitId} onClose={closeRequest} onRetry={openRequest} onEquipmentChange={setRequestEquipmentId} onUnitChange={setRequestUnitId} onStepChange={setRequestStep} onSubmit={submitRequest} />
    </section>
  );
}
