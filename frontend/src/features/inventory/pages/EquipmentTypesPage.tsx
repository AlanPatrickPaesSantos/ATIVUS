import { useState } from 'react'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { SessionContext } from '../../../shared/auth/types'
import { useCreateEquipmentType, useDeactivateEquipmentType, useEquipmentTypesQuery, useUpdateEquipmentType, type EquipmentTypeItem } from '../api/equipmentTypeQueries'

type EditingState = { id: string; name: string; description: string } | null

export function EquipmentTypesPage({ session: _session }: { session: SessionContext }) {
  const typesQuery = useEquipmentTypesQuery(true)
  const createType = useCreateEquipmentType()
  const updateType = useUpdateEquipmentType()
  const deactivateType = useDeactivateEquipmentType()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<EditingState>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function submitCreate(name: string, description: string) {
    setErrorMessage(null)
    void createType.mutateAsync({ name, description }).then(() => setCreating(false)).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível criar o tipo de equipamento.')
    })
  }

  function submitEdit(id: string, name: string, description: string) {
    setErrorMessage(null)
    void updateType.mutateAsync({ id, input: { name, description } }).then(() => setEditing(null)).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o tipo de equipamento.')
    })
  }

  function submitDeactivate(item: EquipmentTypeItem) {
    setErrorMessage(null)
    void deactivateType.mutateAsync(item.id).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível desativar o tipo de equipamento.')
    })
  }

  return <section className="equipment-types-page module-panel" aria-labelledby="equipment-types-title" data-testid="equipment-types-console" data-visual-variant="statewide-governance-console">
    <header className="module-panel__header">
      <div>
        <p className="page-eyebrow">Catálogo padronizado · escopo estadual</p>
        <h1 id="equipment-types-title">Tipos de equipamento</h1>
        <p>Gerencie o catálogo de tipos usado no cadastro e nos filtros de equipamentos.</p>
      </div>
      <div className="module-panel__actions">
        <button type="button" className="button-link button-link--primary" onClick={() => { setErrorMessage(null); setCreating(true) }}>+ Novo tipo</button>
      </div>
    </header>

    {typesQuery.isLoading ? <LoadingState label="Carregando tipos de equipamento" /> : null}
    {typesQuery.isError ? <ErrorState message="Não foi possível carregar os tipos de equipamento." onRetry={() => { void typesQuery.refetch() }} /> : null}
    {errorMessage ? <p role="alert" className="form-error">{errorMessage}</p> : null}

    {!typesQuery.isLoading && !typesQuery.isError ? (
      <div className="equipment-types-list" role="table" aria-label="Tipos de equipamento">
        <div className="equipment-types-list__header" role="row">
          <span role="columnheader">Nome</span>
          <span role="columnheader">Descrição</span>
          <span role="columnheader">Situação</span>
          <span role="columnheader">Ações</span>
        </div>
        {typesQuery.data?.items.length ? typesQuery.data.items.map((item) => (
          <div className="equipment-types-list__row" role="row" key={item.id}>
            <span role="cell"><strong>{item.name}</strong></span>
            <span role="cell">{item.description || '—'}</span>
            <span role="cell">{item.active ? 'Ativo' : 'Inativo'}</span>
            <span role="cell">
              {item.active ? <button type="button" className="button-link" onClick={() => { setErrorMessage(null); setEditing({ id: item.id, name: item.name, description: item.description }) }}>Editar</button> : null}
              {item.active ? <button type="button" className="button-link button-link--danger" onClick={() => { if (window.confirm(`Desativar o tipo "${item.name}"?`)) submitDeactivate(item) }}>Desativar</button> : <small>Desativado</small>}
            </span>
          </div>
        )) : <p className="equipment-types-list__empty">Nenhum tipo cadastrado.</p>}
      </div>
    ) : null}

    <Modal open={creating} title="Novo tipo de equipamento" ariaLabel="Novo tipo de equipamento" size="md" onClose={() => setCreating(false)}>
      <TypeForm submitLabel={createType.isPending ? 'Salvando…' : 'Salvar tipo'} onSubmit={submitCreate} onCancel={() => setCreating(false)} />
    </Modal>

    <Modal open={Boolean(editing)} title="Editar tipo de equipamento" ariaLabel="Editar tipo de equipamento" size="md" onClose={() => setEditing(null)}>
      {editing ? <TypeForm key={editing.id} submitLabel={updateType.isPending ? 'Salvando…' : 'Salvar alterações'} initialName={editing.name} initialDescription={editing.description} onSubmit={(name, description) => submitEdit(editing.id, name, description)} onCancel={() => setEditing(null)} /> : null}
    </Modal>
  </section>
}

function TypeForm({ submitLabel, initialName = '', initialDescription = '', onSubmit, onCancel }: {
  submitLabel: string
  initialName?: string
  initialDescription?: string
  onSubmit: (name: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)

  return <form className="equipment-type-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit(name.trim(), description.trim()) }}>
    <label>Nome
      <input required maxLength={80} aria-label="Nome do tipo" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Rádio portátil" />
    </label>
    <label>Descrição
      <textarea rows={3} aria-label="Descrição do tipo" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Comunicação tática" />
    </label>
    <footer>
      <button type="button" className="button-link" onClick={onCancel}>Cancelar</button>
      <button type="submit" className="button-link button-link--primary">{submitLabel}</button>
    </footer>
  </form>
}