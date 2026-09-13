import type { EquipmentSummary } from '../../../shared/api/contracts'
import { sectionForProblem, type CallDraft } from '../api/callsApi'

const priorityLabels = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' }

type CallReviewProps = {
  draft: CallDraft
  equipment?: EquipmentSummary
  submitting: boolean
  error: boolean
  onBack: () => void
  onSubmit: () => void
}

export function CallReview({ draft, equipment, submitting, error, onBack, onSubmit }: CallReviewProps) {
  return <section className="call-review" aria-labelledby="call-review-title">
    <header><p className="page-eyebrow">Confirmação obrigatória</p><h2 id="call-review-title">Revise antes de enviar</h2><p>Confira as informações. A seção é definida automaticamente pelo problema informado.</p></header>
    {error ? <p role="alert" className="call-form__error">Não foi possível enviar o chamado. Verifique a conexão e tente novamente.</p> : null}
    <dl>
      <div><dt>Seção responsável</dt><dd>{sectionForProblem(draft.problem)}</dd></div>
      <div><dt>Prioridade inicial</dt><dd>{priorityLabels[draft.priority]}</dd></div>
      <div><dt>Assunto</dt><dd>{draft.subject}</dd></div>
      <div><dt>Descrição</dt><dd>{draft.description}</dd></div>
      <div><dt>Equipamento</dt><dd>{equipment ? `${equipment.patrimony} · ${equipment.type} ${equipment.brand} ${equipment.model}` : 'Nenhum equipamento associado'}</dd></div>
      <div><dt>Anexos</dt><dd>{draft.attachments.length ? <ul>{draft.attachments.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul> : 'Nenhum anexo'}</dd></div>
    </dl>
    <div className="call-review__actions"><button type="button" className="button-link" onClick={onBack} disabled={submitting}>Voltar e editar</button><button type="button" className="button-link button-link--primary" onClick={onSubmit} disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar chamado'}</button></div>
  </section>
}
