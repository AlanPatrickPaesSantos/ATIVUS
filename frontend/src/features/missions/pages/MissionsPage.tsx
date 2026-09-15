import { useState } from 'react'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { SessionContext } from '../../../shared/auth/types'
import { missionStatusLabels, missionTypeLabels, type MissionItem, type MissionStatus } from '../api/missionsApi'
import { useMissionsQuery, useUpdateMission } from '../api/missionQueries'

export function MissionsPage({ session }: { session: SessionContext }) {
  const missionsQuery = useMissionsQuery({ unitId: session.unit?.id })
  const updateMission = useUpdateMission()
  const [selected, setSelected] = useState<MissionItem | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function transition(mission: MissionItem, status: MissionStatus, note?: string) {
    setActionError(null)
    void updateMission.mutateAsync({ id: mission.id, input: { status, ...(note ? { note } : {}) } })
      .then(() => setSelected(null))
      .catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'Não foi possível atualizar a missão.'))
  }

  return (
    <section className="missions-page module-panel" aria-labelledby="missions-title">
      <header className="module-panel__header">
        <div>
          <p className="page-eyebrow">Equipe técnica · {session.unit?.name ?? 'DITEL'}</p>
          <h1 id="missions-title">Missões técnicas</h1>
          <p>Acompanhe as missões atribuídas à sua unidade.</p>
        </div>
      </header>

      {missionsQuery.isLoading ? <LoadingState label="Carregando missões técnicas" /> : null}
      {missionsQuery.isError ? <ErrorState message="Não foi possível carregar as missões técnicas." onRetry={() => { void missionsQuery.refetch() }} /> : null}
      {actionError ? <p role="alert" className="form-error">{actionError}</p> : null}

      {!missionsQuery.isLoading && !missionsQuery.isError ? (
        <div className="missions-list" role="table" aria-label="Missões técnicas">
          <div className="missions-list__header" role="row">
            <span role="columnheader">Missão</span>
            <span role="columnheader" className="missions-list__type">Tipo</span>
            <span role="columnheader" className="missions-list__status">Situação</span>
            <span role="columnheader">Prioridade</span>
          </div>
          {missionsQuery.data?.items.length ? missionsQuery.data.items.map((item) => (
            <button type="button" className="missions-list__row" role="row" key={item.id} onClick={() => { setActionError(null); setSelected(item) }}>
              <span role="cell"><strong>{item.title}</strong></span>
              <span role="cell" className="missions-list__type">{missionTypeLabels[item.type]}</span>
              <span role="cell" className="missions-list__status">{missionStatusLabels[item.status]}</span>
              <span role="cell">{item.priority}</span>
            </button>
          )) : (
            <div className="missions-list__empty" role="row">
              <span role="cell"><EmptyState title="Nenhuma missão atribuída" description="Quando a DITEL criar uma missão para a sua unidade, ela aparecerá aqui." /></span>
            </div>
          )}
        </div>
      ) : null}

      <Modal open={Boolean(selected)} title={selected?.title ?? 'Missão'} ariaLabel="Detalhes da missão" size="md" onClose={() => setSelected(null)}>
        {selected ? <MissionDetail mission={selected} onTransition={transition} onClose={() => setSelected(null)} /> : null}
      </Modal>
    </section>
  )
}

function MissionDetail({ mission, onTransition, onClose }: {
  mission: MissionItem
  onTransition: (mission: MissionItem, status: MissionStatus, note?: string) => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  return (
    <div className="mission-detail">
      <p className="page-eyebrow">Atribuída por {mission.assignedBy.name} · {mission.unit.name}</p>
      <p>{mission.description}</p>
      <dl className="mission-detail__meta">
        <div><dt>Tipo</dt><dd>{missionTypeLabels[mission.type]}</dd></div>
        <div><dt>Situação</dt><dd>{missionStatusLabels[mission.status]}</dd></div>
        <div><dt>Prioridade</dt><dd>{mission.priority}</dd></div>
        <div><dt>Aberta em</dt><dd>{new Date(mission.createdAt).toLocaleDateString('pt-BR')}</dd></div>
      </dl>
      {mission.equipment.length ? (
        <section className="mission-detail__equipment">
          <h4>Equipamentos</h4>
          <ul>{mission.equipment.map((equipment) => <li key={equipment.id}>{equipment.patrimony} · {equipment.type} {equipment.model}</li>)}</ul>
        </section>
      ) : null}
      {mission.notes.length ? (
        <section className="mission-detail__notes">
          <h4>Registro de execução</h4>
          <ul>{mission.notes.map((note, index) => <li key={index}><strong>{note.author}</strong>: {note.text}</li>)}</ul>
        </section>
      ) : null}
      <footer className="mission-detail__actions">
        {mission.status === 'assigned' ? <button type="button" className="button-link button-link--primary" onClick={() => onTransition(mission, 'in_progress')}>Iniciar missão</button> : null}
        {mission.status === 'in_progress' ? (
          <>
            <label>Nota de conclusão<textarea rows={3} aria-label="Nota de conclusão" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Descreva o que foi executado" /></label>
            <button type="button" className="button-link button-link--primary" onClick={() => onTransition(mission, 'completed', note.trim() || undefined)}>Concluir missão</button>
          </>
        ) : null}
        <button type="button" className="button-link" onClick={onClose}>Fechar</button>
      </footer>
    </div>
  )
}