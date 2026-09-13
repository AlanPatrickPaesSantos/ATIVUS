import type { EquipmentSummary } from '../../../shared/api/contracts'
import { MAX_ATTACHMENT_SIZE_LABEL, problemOptions, sectionForProblem, validateAttachments, type CallDraft, type CallPriority, type CallProblem } from '../api/callsApi'

type CallFormProps = {
  draft: CallDraft
  equipment: EquipmentSummary[]
  onChange: (draft: CallDraft) => void
  onReview: () => void
  equipmentSearch: string
  hasMoreEquipment: boolean
  onEquipmentSearch: (value: string) => void
  onLoadMoreEquipment: () => void
  attachmentError: string | null
  onAttachmentError: (message: string | null) => void
}

export function CallForm({ draft, equipment, onChange, onReview, equipmentSearch, hasMoreEquipment, onEquipmentSearch, onLoadMoreEquipment, attachmentError, onAttachmentError }: CallFormProps) {
  const section = sectionForProblem(draft.problem)
  const update = <K extends keyof CallDraft>(key: K, value: CallDraft[K]) => onChange({ ...draft, [key]: value })

  return <form className="call-form" onSubmit={(event) => { event.preventDefault(); onReview() }}>
    <div className="call-form__grid">
      <label>Problema
        <select aria-label="Problema" value={draft.problem} onChange={(event) => update('problem', event.target.value as CallProblem)}>
          {problemOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>Prioridade inicial
        <select aria-label="Prioridade inicial" value={draft.priority} onChange={(event) => update('priority', event.target.value as CallPriority)}>
          <option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option>
        </select>
      </label>
      <output className="call-form__routing" aria-live="polite">Seção responsável: <strong>{section}</strong></output>
    </div>
    <label>Assunto<input value={draft.subject} maxLength={120} required onChange={(event) => update('subject', event.target.value)} /></label>
    <label>Descrição<textarea value={draft.description} required rows={6} onChange={(event) => update('description', event.target.value)} /></label>
    <label>Buscar equipamento para associar<input value={equipmentSearch} placeholder="Patrimônio, tipo, modelo ou localização" onChange={(event) => onEquipmentSearch(event.target.value)} /></label>
    <label>Equipamento associado
      <select value={draft.equipmentId ?? ''} onChange={(event) => update('equipmentId', event.target.value || undefined)}>
        <option value="">Nenhum equipamento associado</option>
        {equipment.map((item) => <option key={item.id} value={item.id}>{item.patrimony} · {item.type} {item.brand} {item.model}</option>)}
      </select>
    </label>
    {hasMoreEquipment ? <button type="button" className="button-link" onClick={onLoadMoreEquipment}>Carregar mais equipamentos</button> : null}
    <label>Anexos<span className="call-form__file-control"><input className="call-form__file-input" aria-label="Anexos" type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx" multiple onChange={(event) => {
      const attachments = Array.from(event.target.files ?? [])
      try {
        validateAttachments(attachments)
        onAttachmentError(null)
        onChange({ ...draft, attachments })
      } catch (error) {
        onAttachmentError(error instanceof Error ? error.message : 'Não foi possível validar os anexos.')
        onChange({ ...draft, attachments: [] })
        event.target.value = ''
      }
    }} /><span className="call-form__file-button" aria-hidden="true">Selecionar arquivos</span><span className="call-form__file-state" aria-live="polite">{draft.attachments.length ? `${draft.attachments.length} arquivo${draft.attachments.length === 1 ? '' : 's'} selecionado${draft.attachments.length === 1 ? '' : 's'}` : 'Nenhum arquivo selecionado'}</span></span></label>
    <p className="call-form__hint">Documentos PDF/DOC/DOCX ou fotos JPG/PNG/WEBP/GIF, até {MAX_ATTACHMENT_SIZE_LABEL} por arquivo.</p>
    {attachmentError ? <p role="alert" className="call-form__error">{attachmentError}</p> : null}
    {draft.attachments.length ? <ul className="call-form__attachments" aria-label="Arquivos selecionados">{draft.attachments.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul> : null}
    <button type="submit" className="button-link button-link--primary">Revisar chamado</button>
  </form>
}
