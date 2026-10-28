import { useState } from 'react'
import type { AcMaterialCreateInput } from '../../../shared/api/contracts'

type AcMaterialField = keyof AcMaterialCreateInput
type AcMaterialFormProps = {
  value: AcMaterialCreateInput
  pending: boolean
  error?: string
  onChange: (field: AcMaterialField, value: string) => void
  onCancel: () => void
  onSubmit: () => void
}

const requiredFields: Array<{ field: Extract<AcMaterialField, 'patrimony' | 'type' | 'model' | 'brand' | 'location'>; label: string }> = [
  { field: 'patrimony', label: 'RP patrimonial' },
  { field: 'type', label: 'Tipo de equipamento' },
  { field: 'model', label: 'Modelo' },
  { field: 'brand', label: 'Marca' },
  { field: 'location', label: 'Localização' },
]

const situationLabels: Record<AcMaterialCreateInput['situation'], string> = {
  active: 'Ativo',
  maintenance: 'Em manutenção',
  inactive: 'Inativo',
  lost: 'Perdido',
  written_off: 'Baixado',
}

export function AcMaterialForm({ value, pending, error, onChange, onCancel, onSubmit }: AcMaterialFormProps) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AcMaterialField, string>>>({})

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: Partial<Record<AcMaterialField, string>> = {}
    requiredFields.forEach(({ field, label }) => {
      if (!String(value[field] ?? '').trim()) nextErrors[field] = `${label} é obrigatório.`
    })
    setFieldErrors(nextErrors)
    if (!Object.keys(nextErrors).length) onSubmit()
  }

  function update(field: AcMaterialField, nextValue: string) {
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }))
    onChange(field, nextValue)
  }

  function fieldProps(field: AcMaterialField) {
    return {
      'aria-invalid': Boolean(fieldErrors[field]),
      'aria-describedby': fieldErrors[field] ? `${field}-error` : undefined,
    }
  }

  return (
    <form className="ac-material-form" onSubmit={submit} noValidate>
      <div className="ac-material-form__intro">
        <p className="page-eyebrow">Novo bem patrimonial</p>
        <p>Preencha os dados do material. Campos marcados com <strong aria-hidden="true">*</strong> são obrigatórios.</p>
      </div>
      <aside className="ac-material-form__custody" aria-label="Custódia do material">
        <span>Responsabilidade patrimonial</span>
        <strong>Almoxarifado central (AC)</strong>
        <small>O material será criado sem associação a uma unidade operacional.</small>
      </aside>

      <fieldset>
        <legend>Identificação</legend>
        <label className="ac-field" htmlFor="ac-material-patrimony">RP patrimonial <strong aria-hidden="true">*</strong><input id="ac-material-patrimony" className="ac-control" required value={value.patrimony} onChange={(event) => update('patrimony', event.target.value)} {...fieldProps('patrimony')} />{fieldErrors.patrimony && <span id="patrimony-error" className="ac-field-error" role="alert">{fieldErrors.patrimony}</span>}</label>
        <label className="ac-field" htmlFor="ac-material-type">Tipo de equipamento <strong aria-hidden="true">*</strong><input id="ac-material-type" className="ac-control" required placeholder="Ex.: Rádio portátil" value={value.type} onChange={(event) => update('type', event.target.value)} {...fieldProps('type')} />{fieldErrors.type && <span id="type-error" className="ac-field-error" role="alert">{fieldErrors.type}</span>}</label>
        <label className="ac-field" htmlFor="ac-material-model">Modelo <strong aria-hidden="true">*</strong><input id="ac-material-model" className="ac-control" required placeholder="Informe o modelo" value={value.model} onChange={(event) => update('model', event.target.value)} {...fieldProps('model')} />{fieldErrors.model && <span id="model-error" className="ac-field-error" role="alert">{fieldErrors.model}</span>}</label>
        <label className="ac-field" htmlFor="ac-material-brand">Marca <strong aria-hidden="true">*</strong><input id="ac-material-brand" className="ac-control" required placeholder="Informe a marca" value={value.brand} onChange={(event) => update('brand', event.target.value)} {...fieldProps('brand')} />{fieldErrors.brand && <span id="brand-error" className="ac-field-error" role="alert">{fieldErrors.brand}</span>}</label>
        <label className="ac-field" htmlFor="ac-material-category">Categoria <span className="ac-field__optional">opcional</span><input id="ac-material-category" className="ac-control" placeholder="Ex.: Comunicação" value={value.category} onChange={(event) => update('category', event.target.value)} /></label>
      </fieldset>

      <fieldset>
        <legend>Patrimônio e situação</legend>
        <label className="ac-field" htmlFor="ac-material-serial">Número de série <span className="ac-field__optional">opcional</span><input id="ac-material-serial" className="ac-control" placeholder="Não informado, se aplicável" value={value.serialNumber} onChange={(event) => update('serialNumber', event.target.value)} /></label>
        <label className="ac-field" htmlFor="ac-material-warranty">Garantia <span className="ac-field__optional">opcional</span><input id="ac-material-warranty" className="ac-control" placeholder="Ex.: 12 meses" value={value.warranty} onChange={(event) => update('warranty', event.target.value)} /></label>
        <label className="ac-field" htmlFor="ac-material-location">Localização <strong aria-hidden="true">*</strong><input id="ac-material-location" className="ac-control" required placeholder="Ex.: Almoxarifado AC" value={value.location} onChange={(event) => update('location', event.target.value)} {...fieldProps('location')} />{fieldErrors.location && <span id="location-error" className="ac-field-error" role="alert">{fieldErrors.location}</span>}</label>
        <label className="ac-field" htmlFor="ac-material-situation">Situação <strong aria-hidden="true">*</strong><select id="ac-material-situation" className="ac-control" required value={value.situation} onChange={(event) => update('situation', event.target.value)}>{Object.entries(situationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </fieldset>

      <fieldset>
        <legend>Observações</legend>
        <label className="ac-field" htmlFor="ac-material-observations">Observações <span className="ac-field__optional">opcional</span><textarea id="ac-material-observations" className="ac-control" rows={4} placeholder="Registre informações complementares do recebimento ou armazenamento." value={value.observations} onChange={(event) => update('observations', event.target.value)} /></label>
      </fieldset>

      {error && <p role="alert" className="ac-feedback ac-feedback--error">{error}</p>}
      <footer className="ac-modal-actions">
        <button className="button-link" type="button" onClick={onCancel} disabled={pending}>Cancelar</button>
        <button className="button-link button-link--primary" type="submit" disabled={pending}>{pending ? 'Cadastrando...' : 'Cadastrar material'}</button>
      </footer>
    </form>
  )
}
