import type { SessionContext } from '../../../shared/auth/types'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { MovementApiItem } from '../api/movementsApi'

type PendingMovement = {
  id: string
  type: 'Transferência definitiva' | 'Movimentação temporária' | 'Retorno'
  equipment: string
  origin: string
  destination: string
  requestedBy: string
  requestedAt: string
  status: 'Pendente' | 'Aprovada' | 'Aguardando recebimento' | 'Recebida' | 'Divergência' | 'Rejeitada' | 'Cancelada'
  divergences: MovementApiItem['divergences']
  decision?: string
  updatedAt: string
}

type Props = {
  movement: PendingMovement | null
  session: SessionContext
  reason: string
  reasonError: boolean
  decisionError: string | null
  loading: boolean
  onClose: () => void
  onReasonChange: (value: string) => void
  onDecide: (status: 'Aprovada' | 'Rejeitada') => void
  onReceive: (status: 'Recebida' | 'Divergência') => void
  onResolve: (action: 'retomar' | 'rejeitar') => void
  onCancel: () => void
}

export function MovementDecisionModal({ movement, session, reason, reasonError, decisionError, loading, onClose, onReasonChange, onDecide, onReceive, onResolve, onCancel }: Props) {
  return <Modal open={Boolean(movement)} title="Analisar movimentação" ariaLabel="Analisar movimentação" size="lg" onClose={onClose}>
    {movement && <div className="movement-review-dialog">
      <header><div><p className="page-eyebrow">{movement.id.toUpperCase()} · {movement.type}</p><h2>{movement.equipment}</h2></div><span>{movement.status}</span></header>
      <div className="movement-review-dialog__route"><div><small>Origem</small><strong>{movement.origin}</strong></div><b aria-hidden="true">→</b><div><small>Destino</small><strong>{movement.destination}</strong></div></div>
      <section><h3>{movement.status === 'Pendente' ? 'Solicitação da Unidade' : 'Custódia formal'}</h3><dl><div><dt>Registrada por</dt><dd>{movement.requestedBy}</dd></div><div><dt>Data</dt><dd>{movement.requestedAt}</dd></div><div><dt>Impacto</dt><dd>{movement.status === 'Pendente' ? 'O vínculo patrimonial será atualizado somente após a confirmação do recebimento.' : 'A custódia permanece na origem até o recebimento confirmado.'}</dd></div></dl></section>
      <label>{movement.status === 'Divergência' ? 'Resolução da divergência' : 'Descrição da divergência'}<textarea aria-label={movement.status === 'Pendente' ? 'Justificativa da rejeição' : undefined} disabled={loading} value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder={movement.status === 'Pendente' ? 'Obrigatória apenas se a solicitação for rejeitada.' : 'Obrigatória para registrar ou resolver uma divergência.'} /></label>
      {reasonError && <p className="movement-review-dialog__error" role="alert">Informe uma descrição ou resolução.</p>}
      {decisionError && <p className="movement-review-dialog__error" role="alert">{decisionError}</p>}
      <footer><button className="button-link" type="button" disabled={loading} onClick={onClose}>Cancelar</button>
        {movement.status === 'Pendente' && session.role === 'ditel_admin' && <><button className="button-link button-link--danger" disabled={loading} type="button" onClick={() => onDecide('Rejeitada')}>{loading ? 'Salvando…' : 'Rejeitar movimentação'}</button><button className="button-link button-link--primary" disabled={loading} type="button" onClick={() => onDecide('Aprovada')}>{loading ? 'Salvando…' : 'Aprovar movimentação'}</button></>}
        {movement.status === 'Pendente' && session.role === 'unit_user' && <button className="button-link button-link--danger" disabled={loading} type="button" onClick={onCancel}>Cancelar solicitação</button>}
        {movement.status === 'Aguardando recebimento' && <><button className="button-link button-link--danger" disabled={loading} type="button" onClick={() => onReceive('Divergência')}>Registrar divergência</button><button className="button-link button-link--primary" disabled={loading} type="button" onClick={() => onReceive('Recebida')}>Confirmar recebimento</button></>}
        {movement.status === 'Divergência' && <><button className="button-link button-link--danger" disabled={loading} type="button" onClick={() => onResolve('rejeitar')}>Encerrar como rejeitada</button><button className="button-link button-link--primary" disabled={loading} type="button" onClick={() => onResolve('retomar')}>Retomar recebimento</button></>}
      </footer>
    </div>}
  </Modal>
}
