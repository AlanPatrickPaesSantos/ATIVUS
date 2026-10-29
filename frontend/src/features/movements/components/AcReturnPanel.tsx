import { useEffect, useMemo, useState } from "react";
import type { SessionContext } from "../../../shared/auth/types";
import type { AcReturn } from "../../../shared/api/contracts";
import { getInventory } from "../../inventory/api/inventoryApi";
import { Modal } from "../../../shared/ui/overlays/Modal";
import {
  cancelAcReturn,
  createAcReturn,
  decideAcReturn,
  getAcReturns,
  receiveAcReturn,
  resolveAcReturnDivergence,
} from "../api/movementsApi";

type ReturnableEquipment = {
  id: string;
  patrimony: string;
  type: string;
  model: string;
  situation: string;
};

type AcReturnPanelProps = {
  session: SessionContext
  onStateChange?: (returns: AcReturn[], loading: boolean, error: string | null) => void
}

export function AcReturnPanel({ session, onStateChange }: AcReturnPanelProps) {
  const canRequest = session.role === "unit_user";
  const canDecide = session.role === "ac_operator";
  const canObserve = canRequest || canDecide || session.role === "ditel_admin";
  const [returns, setReturns] = useState<AcReturn[]>([]);
  const [equipment, setEquipment] = useState<ReturnableEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [receiptReason, setReceiptReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    onStateChange?.([], true, null);
    try {
      const pageSize = 100;
      const first = await getAcReturns({ page: 1, pageSize });
      const pageCount = Math.ceil(first.total / pageSize);
      const rest = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => getAcReturns({ page: index + 2, pageSize })));
      const items = [first, ...rest].flatMap((page) => page.items);
      setReturns(items);
      onStateChange?.(items, false, null);
    } catch {
      setError("Não foi possível carregar as devoluções AC.");
      onStateChange?.([], false, "Não foi possível carregar as devoluções AC.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canRequest || canDecide) void load();
  }, [canRequest, canDecide, onStateChange]);

  async function openRequest() {
    setRequestOpen(true);
    setSuccess(false);
    setError(null);
    setEquipmentId("");
    setRequestReason("");
    setPending(true);
    try {
      const result = await getInventory({ page: 1, pageSize: 100 });
      setEquipment(
        result.items.filter(
          (item) =>
            item.situation === "active" || item.situation === "maintenance",
        ),
      );
    } catch {
      setError("Não foi possível carregar os equipamentos da unidade.");
    } finally {
      setPending(false);
    }
  }

  async function submitRequest() {
    if (!equipmentId) return;
    setPending(true);
    setError(null);
    try {
      await createAcReturn(
        {
          equipmentId,
          ...(requestReason.trim() ? { reason: requestReason.trim() } : {}),
        },
        globalThis.crypto?.randomUUID?.() ?? `return-${Date.now()}`,
      );
      setSuccess(true);
      await load();
    } catch {
      setError(
        "Não foi possível registrar a devolução. Atualize os dados e tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }

  async function decide(status: "Aceita" | "Rejeitada") {
    const item = returns.find((entry) => entry.id === decisionId);
    if (!item) return;
    if (status === "Rejeitada" && !decisionReason.trim()) {
      setError("Informe uma justificativa para rejeitar a devolução.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await decideAcReturn(item.id, {
        status,
        updatedAt: item.updatedAt,
        ...(status === "Rejeitada" ? { reason: decisionReason.trim() } : {}),
      });
      setDecisionId(null);
      setDecisionReason("");
      await load();
    } catch {
      setError(
        "A devolução foi alterada por outra operação ou não pôde ser concluída.",
      );
    } finally {
      setPending(false);
    }
  }

  async function receive(status: "Recebida" | "Divergência") {
    const item = returns.find((entry) => entry.id === decisionId);
    if (!item) return;
    if (status === "Divergência" && !receiptReason.trim()) {
      setError("Descreva a divergência encontrada no recebimento.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await receiveAcReturn(item.id, {
        status,
        updatedAt: item.updatedAt,
        ...(status === "Divergência"
          ? { description: receiptReason.trim() }
          : {}),
      });
      setDecisionId(null);
      setReceiptReason("");
      await load();
    } catch {
      setError(
        "Não foi possível registrar o recebimento. Atualize os dados e tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }

  async function resolveDivergence(action: "retomar" | "rejeitar") {
    const item = returns.find((entry) => entry.id === decisionId);
    if (!item || !receiptReason.trim()) {
      setError("Informe a resolução da divergência.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await resolveAcReturnDivergence(item.id, {
        action,
        updatedAt: item.updatedAt,
        resolution: receiptReason.trim(),
      });
      setDecisionId(null);
      setReceiptReason("");
      await load();
    } catch {
      setError("Não foi possível resolver a divergência.");
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    const item = returns.find((entry) => entry.id === decisionId);
    if (!item || !cancelReason.trim()) {
      setError("Informe uma justificativa para cancelar a devolução.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await cancelAcReturn(item.id, {
        updatedAt: item.updatedAt,
        reason: cancelReason.trim(),
      });
      setDecisionId(null);
      setCancelReason("");
      await load();
    } catch {
      setError("A devolução já foi alterada ou não pôde ser cancelada.");
    } finally {
      setPending(false);
    }
  }

  const selectedReturn = useMemo(
    () => returns.find((entry) => entry.id === decisionId) ?? null,
    [decisionId, returns],
  );
  if (!canObserve) return null;

  return (
    <section
      className="module-panel ac-return-panel"
      aria-labelledby="ac-return-title"
    >
      <header>
        <div>
          <p className="page-eyebrow">Custódia patrimonial</p>
          <h2 id="ac-return-title">Devoluções para a AC</h2>
          <p>
            {canDecide
              ? "Analise solicitações pendentes antes de recolher o equipamento."
              : "Solicite o recolhimento do equipamento sob responsabilidade da unidade."}
          </p>
        </div>
        {canRequest && (
          <button
            className="button-link button-link--primary"
            type="button"
            onClick={() => void openRequest()}
          >
            Solicitar devolução para a AC
          </button>
        )}
      </header>
      {loading && <p role="status">Carregando devoluções…</p>}
      {error && !requestOpen && !decisionId && (
        <p className="movement-review-dialog__error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && (
        <div className="ac-return-panel__list">
          {returns.length ? (
            returns.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>
                    {item.equipment?.patrimony ?? item.equipmentId}
                  </strong>
                  <span>
                    {item.origin?.name ?? "Unidade de origem"} · {item.status}
                  </span>
                </div>
                {canDecide &&
                  [
                    "Pendente",
                    "Aguardando recebimento",
                    "Divergência",
                  ].includes(item.status) && (
                    <button
                      className="button-link button-link--quiet"
                      type="button"
                      aria-label={`Analisar devolução ${item.id}`}
                      onClick={() => {
                        setError(null);
                        setReceiptReason("");
                        setDecisionId(item.id);
                      }}
                    >
                      {item.status === "Pendente" ? "Analisar" : "Atualizar"}
                    </button>
                  )}
                {canRequest && item.status === "Pendente" && (
                  <button
                    className="button-link button-link--quiet"
                    type="button"
                    aria-label={`Cancelar devolução ${item.id}`}
                    onClick={() => {
                      setError(null);
                      setCancelReason("");
                      setDecisionId(item.id);
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </article>
            ))
          ) : (
            <p>Nenhuma devolução registrada.</p>
          )}
        </div>
      )}
      <Modal
        open={requestOpen}
        title="Solicitar devolução para a AC"
        ariaLabel="Solicitar devolução para a AC"
        onClose={() => {
          if (!pending) setRequestOpen(false);
        }}
        size="md"
      >
        <div className="movement-review-dialog">
          {success ? (
            <>
              <p role="status">
                Devolução solicitada e aguardando análise da AC.
              </p>
              <button
                className="button-link button-link--primary"
                type="button"
                onClick={() => setRequestOpen(false)}
              >
                Concluir
              </button>
            </>
          ) : (
            <>
              <label>
                Equipamento para devolução
                <select
                  value={equipmentId}
                  onChange={(event) => setEquipmentId(event.target.value)}
                  disabled={pending}
                >
                  <option value="">Selecione um equipamento</option>
                  {equipment.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.patrimony} · {item.type} · {item.model}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Justificativa da devolução
                <textarea
                  value={requestReason}
                  onChange={(event) => setRequestReason(event.target.value)}
                  disabled={pending}
                  placeholder="Opcional: informe o motivo do recolhimento."
                />
              </label>
              {error && (
                <p className="movement-review-dialog__error" role="alert">
                  {error}
                </p>
              )}
              <footer>
                <button
                  className="button-link"
                  type="button"
                  onClick={() => setRequestOpen(false)}
                  disabled={pending}
                >
                  Cancelar
                </button>
                <button
                  className="button-link button-link--primary"
                  type="button"
                  onClick={() => void submitRequest()}
                  disabled={pending || !equipmentId}
                >
                  {pending ? "Salvando…" : "Confirmar devolução"}
                </button>
              </footer>
            </>
          )}
        </div>
      </Modal>
      <Modal
        open={Boolean(selectedReturn)}
        title="Analisar devolução AC"
        ariaLabel="Analisar devolução AC"
        onClose={() => {
          if (!pending) setDecisionId(null);
        }}
        size="md"
      >
        {selectedReturn && (
          <div className="movement-review-dialog">
            <h3>Analisar devolução AC</h3>
            <p>
              <strong>{selectedReturn.equipment?.patrimony ?? selectedReturn.equipmentId}</strong> ·{" "}
              {selectedReturn.origin?.name ?? "Unidade de origem"}
            </p>
            {selectedReturn.status === "Pendente" && canDecide && (
              <>
                <label>
                  Justificativa da decisão
                  <textarea
                    aria-label="Justificativa da decisão"
                    value={decisionReason}
                    onChange={(event) => {
                      setDecisionReason(event.target.value);
                      setError(null);
                    }}
                    disabled={pending}
                    placeholder="Obrigatória para rejeitar."
                  />
                </label>
                <footer>
                  <button
                    className="button-link button-link--danger"
                    type="button"
                    onClick={() => void decide("Rejeitada")}
                    disabled={pending}
                  >
                    Rejeitar devolução
                  </button>
                  <button
                    className="button-link button-link--primary"
                    type="button"
                    onClick={() => void decide("Aceita")}
                    disabled={pending}
                  >
                    Autorizar devolução
                  </button>
                </footer>
              </>
            )}
            {selectedReturn.status === "Pendente" && canRequest && (
              <>
                <label>
                  Justificativa do cancelamento
                  <textarea
                    aria-label="Justificativa do cancelamento"
                    value={cancelReason}
                    onChange={(event) => {
                      setCancelReason(event.target.value);
                      setError(null);
                    }}
                    disabled={pending}
                    placeholder="Obrigatória para cancelar."
                  />
                </label>
                <footer>
                  <button
                    className="button-link"
                    type="button"
                    onClick={() => setDecisionId(null)}
                    disabled={pending}
                  >
                    Voltar
                  </button>
                  <button
                    className="button-link button-link--danger"
                    type="button"
                    onClick={() => void cancel()}
                    disabled={pending}
                  >
                    Cancelar devolução
                  </button>
                </footer>
              </>
            )}
            {selectedReturn.status === "Aguardando recebimento" &&
              canDecide && (
                <>
                  <label>
                    Descrição da divergência
                    <textarea
                      aria-label="Descrição da divergência"
                      value={receiptReason}
                      onChange={(event) => {
                        setReceiptReason(event.target.value);
                        setError(null);
                      }}
                      disabled={pending}
                      placeholder="Preencha apenas se houver divergência."
                    />
                  </label>
                  <footer>
                    <button
                      className="button-link button-link--danger"
                      type="button"
                      onClick={() => void receive("Divergência")}
                      disabled={pending}
                    >
                      Registrar divergência
                    </button>
                    <button
                      className="button-link button-link--primary"
                      type="button"
                      onClick={() => void receive("Recebida")}
                      disabled={pending}
                    >
                      Confirmar recebimento
                    </button>
                  </footer>
                </>
              )}
            {selectedReturn.status === "Divergência" && canDecide && (
              <>
                <label>
                  Resolução da divergência
                  <textarea
                    aria-label="Resolução da divergência"
                    value={receiptReason}
                    onChange={(event) => {
                      setReceiptReason(event.target.value);
                      setError(null);
                    }}
                    disabled={pending}
                    placeholder="Descreva a resolução adotada."
                  />
                </label>
                <footer>
                  <button
                    className="button-link button-link--danger"
                    type="button"
                    onClick={() => void resolveDivergence("rejeitar")}
                    disabled={pending}
                  >
                    Encerrar como rejeitada
                  </button>
                  <button
                    className="button-link button-link--primary"
                    type="button"
                    onClick={() => void resolveDivergence("retomar")}
                    disabled={pending}
                  >
                    Retomar recebimento
                  </button>
                </footer>
              </>
            )}
            {error && (
              <p className="movement-review-dialog__error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
