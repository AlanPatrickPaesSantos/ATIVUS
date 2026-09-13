import { useState } from 'react'
import { ApiError } from '../../../shared/api/errors'
import { useUpdateMaintenance } from '../api/maintenanceQueries'
import type { MaintenanceItem, MaintenanceStatus } from '../api/maintenanceApi'
import { maintenanceStatusLabels } from './MaintenanceTable'

type MaintenanceProgressModalProps = { item: MaintenanceItem; onClose: () => void }

export function MaintenanceProgressModal({ item, onClose }: MaintenanceProgressModalProps) {
  const [status, setStatus] = useState<MaintenanceStatus>(item.status)
  const [diagnosis, setDiagnosis] = useState(item.diagnosis ?? '')
  const [service, setService] = useState(item.service ?? '')
  const [technicalResponsible, setTechnicalResponsible] = useState(item.technicalResponsible ?? '')
  const [observations, setObservations] = useState(item.observations ?? '')
  const [reviewing, setReviewing] = useState(false)
  const [conflict, setConflict] = useState(false)
  const updateMaintenance = useUpdateMaintenance()

  const isConflict = (error: unknown) => {
    if (error instanceof ApiError) return error.code === 'MAINTENANCE_CONFLICT' || error.code === 'USER_CONFLICT'
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code
      return code === 'MAINTENANCE_CONFLICT' || code === 'USER_CONFLICT'
    }
    return false
  }

  const submit = () => {
    void updateMaintenance.mutateAsync({
      maintenanceId: item.id,
      input: {
        status,
        updatedAt: item.updatedAt,
        ...(diagnosis.trim() ? { diagnosis: diagnosis.trim() } : {}),
        ...(service.trim() ? { service: service.trim() } : {}),
        ...(technicalResponsible.trim() ? { technicalResponsible: technicalResponsible.trim() } : {}),
        ...(observations.trim() ? { observations: observations.trim() } : {}),
        ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
      },
    }).then(() => {
      setReviewing(false)
      onClose()
    }).catch((error: unknown) => {
      if (isConflict(error)) {
        setConflict(true)
        setReviewing(false)
      }
    })
  }

  const refreshCurrent = async () => {
    const current = await listItem(item.id)
    if (!current) return
    setStatus(current.status)
    setDiagnosis(current.diagnosis ?? '')
    setService(current.service ?? '')
    setTechnicalResponsible(current.technicalResponsible ?? '')
    setObservations(current.observations ?? '')
    setConflict(false)
    setReviewing(false)
  }

  return <div className="maintenance-progress">
    <header><p className="page-eyebrow">{item.equipment.patrimony}</p><h3>{item.description}</h3></header>
    {updateMaintenance.isError && !conflict ? <p role="alert">Não foi possível atualizar a manutenção. {updateMaintenance.error instanceof Error ? updateMaintenance.error.message : ''}</p> : null}
    {!reviewing ? (
      conflict ? (
        <section className="maintenance-conflict" role="alert">
          <p>A manutenção foi alterada por outra operação. Recarregue os dados atuais para continuar.</p>
          <footer>
            <button type="button" className="button-link" disabled={updateMaintenance.isPending} onClick={refreshCurrent}>{updateMaintenance.isPending ? 'Recarregando…' : 'Recarregar dados atuais'}</button>
            <button type="button" className="button-link" onClick={onClose}>Fechar</button>
          </footer>
        </section>
      ) : (
        <form className="maintenance-form" onSubmit={(event) => { event.preventDefault(); setReviewing(true) }}>
          <label>Situação
            <select aria-label="Situação" value={status} onChange={(event) => setStatus(event.target.value as MaintenanceStatus)}>
              {Object.entries(maintenanceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Diagnóstico<textarea rows={3} aria-label="Diagnóstico" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} /></label>
          <label>Serviço realizado<textarea rows={3} aria-label="Serviço realizado" value={service} onChange={(event) => setService(event.target.value)} /></label>
          <label>Responsável técnico<input aria-label="Responsável técnico" value={technicalResponsible} onChange={(event) => setTechnicalResponsible(event.target.value)} /></label>
          <label>Observações<textarea rows={3} aria-label="Observações" value={observations} onChange={(event) => setObservations(event.target.value)} /></label>
          <footer><button type="button" className="button-link" onClick={onClose}>Fechar</button><button type="submit" className="button-link button-link--primary">Revisar atualização</button></footer>
        </form>
      )
    ) : (
      <section className="maintenance-review">
        <header><p className="page-eyebrow">Confirmação obrigatória</p><h3>Revise antes de atualizar</h3></header>
        <dl>
          <div><dt>Situação</dt><dd>{maintenanceStatusLabels[status]}</dd></div>
          {diagnosis.trim() ? <div><dt>Diagnóstico</dt><dd>{diagnosis}</dd></div> : null}
          {service.trim() ? <div><dt>Serviço</dt><dd>{service}</dd></div> : null}
          {technicalResponsible.trim() ? <div><dt>Responsável técnico</dt><dd>{technicalResponsible}</dd></div> : null}
        </dl>
        <footer>
          <button type="button" className="button-link" disabled={updateMaintenance.isPending} onClick={() => { setReviewing(false); updateMaintenance.reset() }}>Voltar e editar</button>
          <button type="button" className="button-link button-link--primary" disabled={updateMaintenance.isPending} onClick={submit}>{updateMaintenance.isPending ? 'Atualizando…' : updateMaintenance.isError ? 'Tentar novamente' : 'Confirmar atualização'}</button>
        </footer>
      </section>
    )}
  </div>
}

async function listItem(id: string): Promise<MaintenanceItem | null> {
  const { getMaintenance } = await import('../api/maintenanceApi')
  const response = await getMaintenance()
  return response.items.find((item) => item.id === id) ?? null
}