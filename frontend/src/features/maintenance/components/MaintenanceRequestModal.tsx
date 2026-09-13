import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { getInventory } from '../../inventory/api/inventoryApi'
import type { EquipmentSummary } from '../../../shared/api/contracts'
import { useCreateMaintenance } from '../api/maintenanceQueries'
import type { MaintenanceStatus } from '../api/maintenanceApi'

export type MaintenanceDraft = {
  equipmentId: string
  type: 'corrective' | 'preventive'
  description: string
  status: MaintenanceStatus
  callId?: string
}

const emptyDraft: MaintenanceDraft = { equipmentId: '', type: 'corrective', description: '', status: 'open' }

type MaintenanceRequestModalProps = {
  open: boolean
  onClose: () => void
  unitName: string
}

export function MaintenanceRequestModal({ open, onClose, unitName }: MaintenanceRequestModalProps) {
  const [draft, setDraft] = useState<MaintenanceDraft>(emptyDraft)
  const [reviewing, setReviewing] = useState(false)
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([])
  const [loadingEquipment, setLoadingEquipment] = useState(true)
  const [equipmentError, setEquipmentError] = useState(false)
  const createMaintenance = useCreateMaintenance()
  const [savedId, setSavedId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(emptyDraft)
    setReviewing(false)
    setSavedId(null)
    setLoadingEquipment(true)
    setEquipmentError(false)
    void getInventory({ page: 1, pageSize: 100 }).then((response) => {
      setEquipment(response.items.filter((item) => item.situation === 'active' || item.situation === 'maintenance'))
    }).catch(() => {
      setEquipmentError(true)
    }).finally(() => setLoadingEquipment(false))
  }, [open])

  const selectedEquipment = useMemo(() => equipment.find((item) => item.id === draft.equipmentId), [draft.equipmentId, equipment])

  if (!open) return null

  return <Modal open title="Abrir manutenção" ariaLabel="Abrir manutenção" size="md" onClose={() => { if (!createMaintenance.isPending) onClose() }}>
    {loadingEquipment ? <LoadingState label="Carregando equipamentos da Unidade" /> : null}
    {equipmentError ? <ErrorState message="Não foi possível carregar os equipamentos." onRetry={() => { setEquipmentError(false); setLoadingEquipment(true); void getInventory({ page: 1, pageSize: 100 }).then((response) => setEquipment(response.items.filter((item) => item.situation === 'active' || item.situation === 'maintenance'))).catch(() => setEquipmentError(true)).finally(() => setLoadingEquipment(false)) }} /> : null}
    {!loadingEquipment && !equipmentError && !savedId && !reviewing ? (
      <form className="maintenance-form" onSubmit={(event) => { event.preventDefault(); setReviewing(true) }}>
        <p>Encaminhe um equipamento da Unidade para intervenção técnica. A Unidade responsável é <strong>{unitName}</strong>.</p>
        <label>Equipamento
          <select required aria-label="Equipamento" value={draft.equipmentId} onChange={(event) => setDraft((current) => ({ ...current, equipmentId: event.target.value }))}>
            <option value="">Selecione um equipamento</option>
            {equipment.map((item) => <option key={item.id} value={item.id}>{item.patrimony} · {item.type} {item.brand} {item.model}</option>)}
          </select>
        </label>
        <label>Tipo de manutenção
          <select aria-label="Tipo de manutenção" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as MaintenanceDraft['type'] }))}>
            <option value="corrective">Corretiva</option>
            <option value="preventive">Preventiva</option>
          </select>
        </label>
        <label>Descrição do problema
          <textarea required rows={4} aria-label="Descrição do problema" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <footer>
          <button type="button" className="button-link" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button-link button-link--primary">Revisar manutenção</button>
        </footer>
      </form>
    ) : null}
    {!loadingEquipment && !equipmentError && !savedId && reviewing ? (
      <section className="maintenance-review" aria-labelledby="maintenance-review-title">
        <header><p className="page-eyebrow">Confirmação obrigatória</p><h3 id="maintenance-review-title">Revise antes de abrir</h3></header>
        {submitError ? <p role="alert">Não foi possível abrir a manutenção. Verifique a conexão e tente novamente.</p> : null}
        <dl>
          <div><dt>Equipamento</dt><dd>{selectedEquipment ? `${selectedEquipment.patrimony} · ${selectedEquipment.type} ${selectedEquipment.brand} ${selectedEquipment.model}` : draft.equipmentId}</dd></div>
          <div><dt>Tipo</dt><dd>{draft.type === 'corrective' ? 'Corretiva' : 'Preventiva'}</dd></div>
          <div><dt>Descrição</dt><dd>{draft.description}</dd></div>
        </dl>
        <footer>
          <button type="button" className="button-link" disabled={createMaintenance.isPending} onClick={() => { setReviewing(false); setSubmitError(false); createMaintenance.reset() }}>Voltar e editar</button>
          <button type="button" className="button-link button-link--primary" disabled={createMaintenance.isPending} onClick={() => {
            if (!draft.equipmentId || !draft.description.trim()) return
            void createMaintenance.mutateAsync({ equipmentId: draft.equipmentId, description: draft.description.trim(), status: 'open', type: draft.type }).then(() => setSavedId(draft.equipmentId)).catch(() => setSubmitError(true))
          }}>{createMaintenance.isPending ? 'Abrindo…' : submitError ? 'Tentar novamente' : 'Confirmar abertura'}</button>
        </footer>
      </section>
    ) : null}
    {!loadingEquipment && !equipmentError && savedId ? (
      <section role="status" className="maintenance-success"><h3>Manutenção aberta com sucesso</h3><p>O registro foi criado e a equipe DITEL poderá acompanhar o andamento.</p><button type="button" className="button-link button-link--primary" onClick={onClose}>Concluir</button></section>
    ) : null}
  </Modal>
}