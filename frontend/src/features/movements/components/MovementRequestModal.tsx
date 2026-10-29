import type { EquipmentSummary } from '../../../shared/api/contracts'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { UnitOption } from '../api/unitsApi'

type Props = {
  open: boolean
  success: boolean
  step: 'form' | 'review'
  error: string | null
  loading: boolean
  equipmentOptions: EquipmentSummary[]
  unitOptions: UnitOption[]
  equipmentId: string
  unitId: string
  onClose: () => void
  onRetry: () => void
  onEquipmentChange: (value: string) => void
  onUnitChange: (value: string) => void
  onStepChange: (step: 'form' | 'review') => void
  onSubmit: () => void
}

export function MovementRequestModal({ open, success, step, error, loading, equipmentOptions = [], unitOptions = [], equipmentId, unitId, onClose, onRetry, onEquipmentChange, onUnitChange, onStepChange, onSubmit }: Props) {
  return <Modal open={open} title="Solicitar transferência" ariaLabel="Solicitar transferência" size="lg" onClose={onClose}>
    {success ? <div><h2>Solicitação registrada</h2><p role="status">A solicitação foi registrada e aguarda decisão DITEL.</p><button className="button-link button-link--primary" type="button" onClick={onClose}>Concluir</button></div> : <div className="movement-review-dialog"><h2>{step === 'form' ? 'Nova transferência' : 'Revisar transferência'}</h2>{error && <p className="movement-review-dialog__error" role="alert">{error}</p>}{error && <button className="button-link" type="button" onClick={onRetry} disabled={loading}>Tentar novamente</button>}{loading && <p role="status">Carregando…</p>}{!loading && step === 'form' && <><label>Equipamento<select aria-label="Equipamento" value={equipmentId} onChange={(event) => onEquipmentChange(event.target.value)}><option value="">Selecione um equipamento ativo</option>{equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.patrimony} · {item.type} · {item.model}</option>)}</select></label><label>Unidade destino<select aria-label="Unidade destino" value={unitId} onChange={(event) => onUnitChange(event.target.value)}><option value="">Selecione uma unidade</option>{unitOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.acronym})</option>)}</select></label><footer><button className="button-link" type="button" onClick={onClose}>Cancelar</button><button className="button-link button-link--primary" type="button" disabled={!equipmentId || !unitId} onClick={() => onStepChange('review')}>Revisar solicitação</button></footer></>}{!loading && step === 'review' && <><p>{equipmentOptions.find((item) => item.id === equipmentId)?.patrimony} → {unitOptions.find((item) => item.id === unitId)?.name}</p><footer><button className="button-link" type="button" onClick={() => onStepChange('form')}>Voltar</button><button className="button-link button-link--primary" type="button" disabled={loading} onClick={onSubmit}>Confirmar solicitação</button></footer></>}</div>}
  </Modal>
}
