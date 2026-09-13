import { useEffect, useRef, useState } from 'react'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import { getEquipmentDetails, updateEquipmentSituation } from '../api/inventoryApi'
import { getMaintenance } from '../../maintenance/api/maintenanceApi'
import { maintenanceStatusLabels } from '../../maintenance/components/MaintenanceTable'
import type { EquipmentDetails } from '../../../shared/api/contracts'
import type { MaintenanceItem } from '../../maintenance/api/maintenanceApi'
import { EquipmentDetailTabs } from './EquipmentDetailTabs'

type EquipmentDetailModalProps = { equipmentId: string | null; open: boolean; onClose: () => void; onOpenCall: (equipmentId: string) => void }

const situationLabels: Record<EquipmentDetails['situation'], string> = {
  active: 'Ativo',
  maintenance: 'Em manutenção',
  written_off: 'Baixado',
  lost: 'Perdido',
  inactive: 'Inativo',
}

function situationTone(situation: EquipmentDetails['situation']) {
  return situation === 'active' ? 'available' : situation === 'maintenance' ? 'attention' : 'critical'
}

export function EquipmentDetailModal({ equipmentId, open, onClose, onOpenCall }: EquipmentDetailModalProps) {
  const [equipment, setEquipment] = useState<EquipmentDetails | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState('summary')
  const [situation, setSituation] = useState<EquipmentDetails['situation']>('active')
  const [confirmingChange, setConfirmingChange] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [maintenance, setMaintenance] = useState<MaintenanceItem[]>([])
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false)
  const requestVersion = useRef(0)

  useEffect(() => {
    requestVersion.current += 1
    const version = requestVersion.current
    if (!open || !equipmentId) return
    const controller = new AbortController()
    let active = true
    setEquipment(null)
    setError(false)
    setTab('summary')
    setConfirmingChange(false)
    setSaveError(null)
    setMaintenance([])
    setMaintenanceLoaded(false)
    void getEquipmentDetails(equipmentId, controller.signal).then((value) => {
      if (active && version === requestVersion.current) {
        setEquipment(value)
        setSituation(value.situation)
      }
    }).catch(() => {
      if (active && version === requestVersion.current) setError(true)
    })
    void getMaintenance().then((response) => {
      if (active && version === requestVersion.current) {
        setMaintenance(response.items.filter((item) => item.equipment.id === equipmentId))
        setMaintenanceLoaded(true)
      }
    }).catch(() => {
      if (active && version === requestVersion.current) setMaintenanceLoaded(true)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [equipmentId, open])

  const situationLabel = situationLabels[situation]
  const nextSituation = situation === 'inactive' ? 'active' : 'inactive'
  const nextSituationLabel = nextSituation === 'active' ? 'Ativo' : 'Inativo'

  return <Modal open={open} title="Detalhes do equipamento" ariaLabel={equipment ? `Equipamento ${equipment.patrimony}` : undefined} onClose={onClose} size="lg" className="equipment-modal">
    {error ? <ErrorState message="Não foi possível carregar os detalhes do equipamento." /> : null}
    {!error && !equipment ? <LoadingState label="Carregando detalhes do equipamento" /> : null}
    {equipment ? <div className="equipment-detail" data-layout="responsive" data-testid="equipment-detail-console" data-visual-variant="command-console">
      <header className="equipment-detail__hero">
        <span className="equipment-detail__icon" aria-hidden="true">▣</span>
        <div className="equipment-detail__identity"><h3>{equipment.patrimony}</h3><p>{equipment.type} · {equipment.brand} {equipment.model}</p></div>
        <div className="equipment-detail__status"><span>Situação</span><strong><i className={`semantic-dot semantic-dot--${situationTone(situation)}`} />{situationLabel}</strong></div>
        <div className="equipment-detail__unit"><span>Unidade responsável</span><strong>{equipment.unitName}</strong></div>
      </header>
      <div className="equipment-detail__body" data-testid="equipment-detail-body">
        <div className="equipment-detail__content"><EquipmentDetailTabs equipment={{ ...equipment, situation }} value={tab} onChange={setTab} /></div>
        <aside className="equipment-operations" aria-label="Painel operacional" data-testid="equipment-operations-panel">
        <h3>Painel operacional</h3>
        <section><header><span>Chamados vinculados</span><b>{equipment.linkedCalls.length}</b></header>{equipment.linkedCalls.length ? equipment.linkedCalls.map((call) => <article key={call.id}><strong>{call.id.toUpperCase()}</strong><p>{call.subject}</p><small>{call.status} · {formatOperationalDate(call.openedAt)}</small></article>) : <p>Nenhum chamado vinculado.</p>}</section>
        <section><header><span>Movimentações recentes</span><b>{equipment.history.length}</b></header>{equipment.history.length ? equipment.history.slice(0, 2).map((entry) => <article key={entry.id}><small>{formatOperationalDate(entry.occurredAt)}</small><p>{entry.description}</p></article>) : <p>Nenhuma movimentação registrada.</p>}</section>
        <section data-testid="equipment-maintenance-history"><header><span>Manutenções</span><b>{maintenanceLoaded ? maintenance.length : '…'}</b></header>{!maintenanceLoaded ? <p>Carregando histórico…</p> : maintenance.length ? maintenance.slice(0, 3).map((item) => <article key={item.id}><small>{formatOperationalDate(item.openedAt)} · {maintenanceStatusLabels[item.status]}</small><p>{item.description}</p></article>) : <p>Nenhuma manutenção registrada.</p>}</section>
        <section><header><span>Documentos vinculados</span><b>{equipment.documents.length}</b></header>{equipment.documents.length ? equipment.documents.map((document) => <article className="equipment-document" data-row="operational-file" data-testid={`equipment-document-row-${document.id}`} key={document.id}><span className="equipment-document__name"><a href={document.downloadUrl}>{document.name}</a></span><a className="button-link" href={document.downloadUrl} aria-label={`Baixar ${document.name}`}>↓</a></article>) : <p>Nenhum documento disponível.</p>}</section>
        <footer><span>Última atualização</span><strong>{formatOperationalDate(equipment.updatedAt)}</strong><small>{equipment.updatedBy ? `Por: ${equipment.updatedBy}` : 'Responsável não informado'}</small></footer>
        </aside>
      </div>
      <footer className="equipment-detail__actions" data-density="command-actions" data-testid="equipment-action-bar"><button type="button">Mais ações⌄</button><span /><button aria-label="Editar equipamento" className="equipment-action--edit" type="button" onClick={() => setConfirmingChange(true)}>✎ <span aria-hidden="true">Editar equipamento</span></button><button aria-label="Abrir chamado" className="equipment-action--call" type="button" onClick={() => onOpenCall(equipment.id)}>⊞ <span aria-hidden="true">Abrir chamado</span></button></footer>
      {confirmingChange ? <section className="status-change" data-visual-variant="status-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="status-change-title" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setConfirmingChange(false) }}>
        <header><h3 id="status-change-title">Confirmar alteração de situação</h3><span aria-hidden="true">▲</span></header>
        <p>Você está prestes a alterar a situação deste equipamento.</p>
        <div className="status-change__comparison"><div className="status-change__current"><span>Situação atual</span><strong><i className={`semantic-dot semantic-dot--${situationTone(situation)}`} />{situationLabel}</strong></div><b aria-hidden="true">→</b><div className="status-change__next"><span>Nova situação</span><strong><i className={`semantic-dot semantic-dot--${situationTone(nextSituation)}`} />{nextSituationLabel}</strong></div></div>
        <h4>Impacto desta alteração</h4><p className="status-change__impact">A alteração será registrada no histórico e poderá exigir manutenção antes de uma nova ativação.</p>
        {saveError ? <p role="alert">{saveError}</p> : null}
        <footer><button type="button" disabled={saving} onClick={() => setConfirmingChange(false)}>Voltar e revisar</button><button className="status-change__confirm" type="button" disabled={saving} onClick={() => {
          if (!equipment.updatedAt) { setSaveError('Não foi possível confirmar a versão atual do equipamento. Recarregue os detalhes.'); return }
          setSaving(true); setSaveError(null)
          void updateEquipmentSituation(equipment.id, nextSituation, equipment.updatedAt).then((updated) => { setEquipment((current) => current ? { ...current, ...updated } : current); setSituation(updated.situation); setConfirmingChange(false) }).catch((error: unknown) => { setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar a alteração.') }).finally(() => setSaving(false))
        }}>{saving ? 'Salvando...' : 'Confirmar alteração'}</button></footer>
      </section> : null}
    </div> : null}
  </Modal>
}

function formatOperationalDate(value?: string) {
  if (!value) return 'Não informado'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
