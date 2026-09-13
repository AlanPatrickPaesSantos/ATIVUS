import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { validateEquipmentAttachments } from '../api/equipmentAttachments'
import { createEquipment } from '../api/inventoryApi'
import { useEquipmentTypesQuery } from '../api/equipmentTypeQueries'

type EquipmentRegistrationModalProps = { open: boolean; onClose: () => void; unitName: string; onSaved?: () => void }

type EquipmentDraft = {
  patrimony: string
  section: string
  type: string
  model: string
  serialNumber: string
  brand: string
  hasWarranty: string
  warrantyDate: string
  situation: string
  location: string
  observations: string
}

const emptyDraft: EquipmentDraft = {
  patrimony: '', section: '', type: '', model: '', serialNumber: '', brand: '', hasWarranty: '', warrantyDate: '', situation: 'active', location: '', observations: '',
}

const equipmentTypesBySection: Record<string, string[]> = {
  support: ['Computador portátil', 'Impressora', 'Monitor', 'Periférico'],
  telecom: ['Rádio portátil', 'Rádio móvel', 'Antena', 'Switch', 'Roteador'],
}

const sectionLabels: Record<string, string> = { support: 'Suporte', telecom: 'Telecom' }

const equipmentModelsByType: Record<string, string[]> = {
  'Computador portátil': ['Dell Latitude 5420', 'HP ProBook 440', 'Lenovo ThinkPad E14'],
  Impressora: ['HP LaserJet Pro', 'Epson EcoTank'],
  Monitor: ['Dell P2422H', 'LG 24MP400'],
  Periférico: ['Teclado USB', 'Mouse USB', 'Webcam'],
  'Rádio portátil': ['Motorola APX 2000', 'Motorola MTP 8500'],
  'Rádio móvel': ['Motorola APX 6500', 'Motorola XTL 2500'],
  Antena: ['UHF Base', 'VHF Móvel'],
  Switch: ['TP-Link SG1024D', 'Cisco CBS250'],
  Roteador: ['MikroTik hEX', 'Cisco ISR 1100'],
}

const situationLabels: Record<string, string> = {
  active: 'Ativo',
  maintenance: 'Em manutenção',
  written_off: 'Baixado',
  lost: 'Perdido',
  inactive: 'Inativo',
}

export function EquipmentRegistrationModal({ open, onClose, unitName, onSaved }: EquipmentRegistrationModalProps) {
  const [draft, setDraft] = useState<EquipmentDraft>(emptyDraft)
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const typesQuery = useEquipmentTypesQuery()

  const sectionTypes = useMemo(() => {
    const fixed: string[] = equipmentTypesBySection[draft.section] ?? []
    const catalog: string[] = (typesQuery.data?.items ?? []).map((item) => item.name)
    return [...new Set<string>([...fixed, ...catalog])]
  }, [draft.section, typesQuery.data])

  useEffect(() => { if (!open) setReviewing(false) }, [open])

  function close() {
    setDraft(emptyDraft)
    setAttachments([])
    setAttachmentError('')
    setReviewing(false); setSaving(false); setSaveError('')
    onClose()
  }

  async function save() {
    setSaving(true); setSaveError('')
    try { await createEquipment({ ...draft, category: sectionLabels[draft.section] ?? draft.section }, attachments); onSaved?.(); close() }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar o equipamento.') }
    finally { setSaving(false) }
  }

  function selectAttachments(files: File[]) {
    try {
      validateEquipmentAttachments(files)
      setAttachments(files)
      setAttachmentError('')
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Não foi possível validar os anexos.')
    }
  }

  return (
    <Modal open={open} title="Cadastrar equipamento" onClose={close} size="lg" className="equipment-registration-modal">
      {reviewing ? (
        <section className="equipment-registration__review" aria-labelledby="equipment-registration-review-title">
          <p className="page-eyebrow">Revisão do cadastro</p>
          <h3 id="equipment-registration-review-title">Confira os dados antes de salvar.</h3>
          <dl>
            <div><dt>Patrimônio</dt><dd>{draft.patrimony}</dd></div>
            <div><dt>Seção responsável</dt><dd>{sectionLabels[draft.section]}</dd></div>
            <div><dt>Tipo</dt><dd>{draft.type}</dd></div>
            <div><dt>Número de série</dt><dd>{draft.serialNumber || 'Não informado'}</dd></div>
            <div><dt>Marca</dt><dd>{draft.brand}</dd></div>
            <div><dt>Modelo</dt><dd>{draft.model}</dd></div>
            <div><dt>Garantia</dt><dd>{draft.hasWarranty === 'yes' ? `Sim — até ${draft.warrantyDate}` : 'Não'}</dd></div>
            <div><dt>Unidade responsável</dt><dd>{unitName}</dd></div>
            <div><dt>Situação</dt><dd>{situationLabels[draft.situation]}</dd></div>
            <div><dt>Localização</dt><dd>{draft.location}</dd></div>
            {draft.observations && <div><dt>Observações</dt><dd>{draft.observations}</dd></div>}
            <div><dt>Anexos</dt><dd>{attachments.length ? <ul>{attachments.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul> : 'Nenhum anexo'}</dd></div>
          </dl>
          <section className="equipment-registration__history" aria-label="Histórico inicial">
            <h4>Histórico inicial</h4>
            <p>Cadastro inicial será registrado no histórico do equipamento.</p>
          </section>
          <p className="equipment-registration__preview-note">Esta é uma prévia visual: a validação de duplicidade e o salvamento serão executados pelo backend.</p>
          {saveError && <p role="alert">{saveError}</p>}
          <footer className="equipment-registration__actions"><button type="button" className="button-link" onClick={() => setReviewing(false)} disabled={saving}>Voltar</button><button type="button" className="button-link button-link--primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar equipamento'}</button></footer>
        </section>
      ) : (
        <form className="equipment-registration" onSubmit={(event) => { event.preventDefault(); setReviewing(true) }}>
          <div className="equipment-registration__intro"><p className="page-eyebrow">Novo ativo tecnológico</p><p>Os campos marcados com <b aria-hidden="true">*</b> são obrigatórios para iniciar o cadastro patrimonial.</p></div>
          <aside className="equipment-registration__unit" aria-label="Unidade responsável"><span>Unidade responsável</span><strong>{unitName}</strong><small>Vinculada automaticamente ao seu acesso.</small></aside>
          <fieldset><legend>Identificação</legend>
            <label>Patrimônio <b aria-hidden="true">*</b><input value={draft.patrimony} onChange={(event) => setDraft({ ...draft, patrimony: event.target.value })} placeholder="PAT-2026-000000" required /></label>
            <label>Seção responsável <b aria-hidden="true">*</b><select aria-label="Seção responsável" value={draft.section} onChange={(event) => setDraft({ ...draft, section: event.target.value, type: '' })} required><option value="">Selecione uma seção</option><option value="support">Suporte</option><option value="telecom">Telecom</option></select></label>
            <label>Tipo <b aria-hidden="true">*</b><select aria-label="Tipo" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value, model: '' })} disabled={!draft.section} required><option value="">{draft.section ? 'Selecione o equipamento' : 'Selecione uma seção primeiro'}</option>{sectionTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Modelo <b aria-hidden="true">*</b><select aria-label="Modelo" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} disabled={!draft.type} required><option value="">{draft.type ? 'Selecione o modelo' : 'Selecione um tipo primeiro'}</option>{(equipmentModelsByType[draft.type] ?? []).map((model) => <option key={model}>{model}</option>)}</select></label>
            <label>Número de série<input value={draft.serialNumber} onChange={(event) => setDraft({ ...draft, serialNumber: event.target.value })} placeholder="Opcional" /></label>
          </fieldset>
          <fieldset><legend>Características</legend>
            <label>Marca <b aria-hidden="true">*</b><input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="Ex.: Motorola" required /></label>
            <fieldset className="equipment-registration__warranty"><legend>Garantia <b aria-hidden="true">*</b></legend><div className="equipment-registration__choice" role="group" aria-label="Garantia"><label><input type="radio" name="has-warranty" value="yes" checked={draft.hasWarranty === 'yes'} onChange={(event) => setDraft({ ...draft, hasWarranty: event.target.value })} required /> Sim</label><label><input type="radio" name="has-warranty" value="no" checked={draft.hasWarranty === 'no'} onChange={(event) => setDraft({ ...draft, hasWarranty: event.target.value, warrantyDate: '' })} required /> Não</label></div>{draft.hasWarranty === 'yes' && <label>Data da garantia <b aria-hidden="true">*</b><input aria-label="Data da garantia" type="date" value={draft.warrantyDate} onChange={(event) => setDraft({ ...draft, warrantyDate: event.target.value })} required /></label>}</fieldset>
          </fieldset>
          <fieldset><legend>Situação e alocação</legend>
            <label>Situação <b aria-hidden="true">*</b><select aria-label="Situação" value={draft.situation} onChange={(event) => setDraft({ ...draft, situation: event.target.value })} required><option value="active">Ativo</option><option value="maintenance">Em manutenção</option><option value="written_off">Baixado</option><option value="lost">Perdido</option><option value="inactive">Inativo</option></select></label>
            <label>Localização <b aria-hidden="true">*</b><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Ex.: Sala de Comunicações" required /></label>
            <label className="equipment-registration__observations">Observações<textarea value={draft.observations} onChange={(event) => setDraft({ ...draft, observations: event.target.value })} placeholder="Informações adicionais, se necessário." rows={3} /></label>
          </fieldset>
          <fieldset className="equipment-registration__attachments"><legend>Anexos</legend>
            <label>Documentos do equipamento<input aria-label="Selecionar anexos" type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => selectAttachments(Array.from(event.target.files ?? []))} /></label>
            <p className="equipment-registration__field-help" role="status">PDF, JPG ou PNG, até 15 MiB por arquivo. Os arquivos são salvos fora da área pública.</p>
            {attachmentError && <p role="alert">{attachmentError}</p>}
            {attachments.length ? <ul aria-label="Anexos selecionados">{attachments.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul> : null}
          </fieldset>
          <footer className="equipment-registration__actions"><button type="button" className="button-link" onClick={close}>Cancelar</button><button type="submit" className="button-link button-link--primary">Continuar para revisão</button></footer>
        </form>
      )}
    </Modal>
  )
}
