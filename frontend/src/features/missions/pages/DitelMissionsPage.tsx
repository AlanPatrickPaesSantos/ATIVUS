import { useState } from 'react'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { SessionContext } from '../../../shared/auth/types'
import { missionStatusLabels, missionTypeLabels, type MissionInput, type MissionItem, type MissionPriority, type MissionType } from '../api/missionsApi'
import { useMissionsQuery, useCreateMission, useUpdateMission } from '../api/missionQueries'

const defaultUnit = { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }

export function DitelMissionsPage({ session: _session }: { session: SessionContext }) {
  const missionsQuery = useMissionsQuery()
  const createMission = useCreateMission()
  const updateMission = useUpdateMission()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<MissionItem | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  function cancelMission(mission: MissionItem) {
    setFormError(null)
    const reason = window.prompt('Motivo do cancelamento:')
    if (reason?.trim()) {
      void updateMission.mutateAsync({ id: mission.id, input: { status: 'cancelled', note: reason.trim() } })
        .catch((error: unknown) => setFormError(error instanceof Error ? error.message : 'Não foi possível cancelar a missão.'))
    }
  }

  return (
    <section className="missions-page module-panel" aria-labelledby="missions-title">
      <header className="module-panel__header">
        <div>
          <p className="page-eyebrow">Escopo estadual · gestão DITEL</p>
          <h1 id="missions-title">Missões técnicas</h1>
          <p>Crie e acompanhe missões técnicas para as unidades.</p>
        </div>
        <div className="module-panel__actions">
          <button type="button" className="button-link button-link--primary" onClick={() => { setFormError(null); setCreating(true) }}>+ Nova missão</button>
        </div>
      </header>

      {missionsQuery.isLoading ? <LoadingState label="Carregando missões técnicas" /> : null}
      {missionsQuery.isError ? <ErrorState message="Não foi possível carregar as missões técnicas." onRetry={() => { void missionsQuery.refetch() }} /> : null}
      {formError ? <p role="alert" className="form-error">{formError}</p> : null}

      {!missionsQuery.isLoading && !missionsQuery.isError ? (
        <div className="missions-list" role="table" aria-label="Missões técnicas">
          <div className="missions-list__header" role="row">
            <span role="columnheader">Missão</span>
            <span role="columnheader" className="missions-list__unit">Unidade</span>
            <span role="columnheader" className="missions-list__type">Tipo</span>
            <span role="columnheader" className="missions-list__status">Situação</span>
            <span role="columnheader">Ações</span>
          </div>
          {missionsQuery.data?.items.length ? missionsQuery.data.items.map((item) => (
            <div className="missions-list__row" role="row" key={item.id}>
              <span role="cell"><strong>{item.title}</strong></span>
              <span role="cell" className="missions-list__unit">{item.unit.name}</span>
              <span role="cell" className="missions-list__type">{missionTypeLabels[item.type]}</span>
              <span role="cell" className="missions-list__status">{missionStatusLabels[item.status]}</span>
              <span role="cell">
                <button type="button" className="button-link" onClick={() => { setFormError(null); setSelected(item) }}>Ver</button>
                {item.status === 'assigned' || item.status === 'in_progress' ? (
                  <button type="button" className="button-link button-link--danger" onClick={() => cancelMission(item)}>Cancelar</button>
                ) : null}
              </span>
            </div>
          )) : (
            <div className="missions-list__empty" role="row">
              <span role="cell"><EmptyState title="Nenhuma missão técnica registrada" description="Crie a primeira missão para as unidades do Estado." /></span>
            </div>
          )}
        </div>
      ) : null}

      <Modal open={creating} title="Criar missão técnica" ariaLabel="Criar missão técnica" size="lg" onClose={() => setCreating(false)}>
        <CreateMissionForm onSubmit={(input) => {
          setFormError(null)
          void createMission.mutateAsync(input).then(() => setCreating(false)).catch((error: unknown) => {
            setFormError(error instanceof Error ? error.message : 'Não foi possível criar a missão.')
          })
        }} />
      </Modal>

      <Modal open={Boolean(selected)} title={selected?.title ?? 'Missão'} ariaLabel="Detalhes da missão" size="md" onClose={() => setSelected(null)}>
        {selected ? (
          <div className="mission-detail">
            <dl className="mission-detail__meta">
              <div><dt>Unidade</dt><dd>{selected.unit.name}</dd></div>
              <div><dt>Tipo</dt><dd>{missionTypeLabels[selected.type]}</dd></div>
              <div><dt>Situação</dt><dd>{missionStatusLabels[selected.status]}</dd></div>
              <div><dt>Prioridade</dt><dd>{selected.priority}</dd></div>
              <div><dt>Aberta por</dt><dd>{selected.assignedBy.name}</dd></div>
              <div><dt>Início</dt><dd>{selected.startedAt ? new Date(selected.startedAt).toLocaleDateString('pt-BR') : '—'}</dd></div>
              <div><dt>Conclusão</dt><dd>{selected.completedAt ? new Date(selected.completedAt).toLocaleDateString('pt-BR') : '—'}</dd></div>
            </dl>
            <p>{selected.description}</p>
            {selected.notes.length ? (
              <section className="mission-detail__notes">
                <h4>Registro de execução</h4>
                <ul>{selected.notes.map((note, index) => <li key={index}><strong>{note.author}</strong>: {note.text}</li>)}</ul>
              </section>
            ) : null}
            <button type="button" className="button-link" onClick={() => setSelected(null)}>Fechar</button>
          </div>
        ) : null}
      </Modal>
    </section>
  )
}

function CreateMissionForm({ onSubmit }: { onSubmit: (input: MissionInput) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<MissionType>('maintenance')
  const [priority, setPriority] = useState<MissionPriority>('medium')

  return (
    <form className="mission-form" onSubmit={(event) => { event.preventDefault(); if (title.trim() && description.trim()) onSubmit({ title: title.trim(), description: description.trim(), type, priority, unit: defaultUnit }) }}>
      <label>Título<b aria-hidden="true">*</b><input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Instalar rádio na sala" aria-label="Título da missão" /></label>
      <label>Descrição<b aria-hidden="true">*</b><textarea rows={3} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descreva a missão" aria-label="Descrição da missão" /></label>
      <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as MissionType)} aria-label="Tipo de missão">
        <option value="maintenance">Manutenção</option>
        <option value="installation">Instalação</option>
        <option value="inspection">Inspeção</option>
        <option value="training">Treinamento</option>
        <option value="other">Outra</option>
      </select></label>
      <label>Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value as MissionPriority)} aria-label="Prioridade da missão">
        <option value="low">Baixa</option>
        <option value="medium">Média</option>
        <option value="high">Alta</option>
        <option value="critical">Crítica</option>
      </select></label>
      <footer>
        <button type="submit" className="button-link button-link--primary">Criar missão</button>
      </footer>
    </form>
  )
}