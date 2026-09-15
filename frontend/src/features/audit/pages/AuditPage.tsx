import { useMemo, useState } from 'react'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { SessionContext } from '../../../shared/auth/types'
import { auditModuleLabels, auditResultLabels, type AuditEventFilters, type AuditEventItem } from '../api/auditApi'
import { useAuditEventsQuery } from '../api/auditQueries'

const actionLabels: Record<string, string> = {
  'login.success': 'Login',
  'login.failure': 'Login falho',
  'logout': 'Logout',
  'equipment.situation.update': 'Situação de equipamento',
  'maintenance.create': 'Abertura de manutenção',
  'maintenance.update': 'Atualização de manutenção',
  'calls.triage': 'Triagem de chamado',
  'mission.create': 'Criação de missão',
  'mission.transition': 'Transição de missão',
  'equipment_type.create': 'Criação de tipo',
  'equipment_type.update': 'Edição de tipo',
  'equipment_type.deactivate': 'Desativação de tipo',
  'admin.users.create': 'Criação de usuário',
  'admin.users.update': 'Edição de usuário',
  'admin.users.situation': 'Situação de usuário',
  'admin.users.password_reset': 'Redefinição de senha',
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function ActionDetail({ event }: { event: AuditEventItem }) {
  return (
    <div className="audit-detail">
      <dl className="audit-detail__meta">
        <div><dt>Ação</dt><dd>{event.action}</dd></div>
        <div><dt>Módulo</dt><dd>{auditModuleLabels[event.module] ?? event.module}</dd></div>
        <div><dt>Resultado</dt><dd>{auditResultLabels[event.result] ?? event.result}</dd></div>
        <div><dt>Usuário</dt><dd>{event.actor && 'name' in event.actor ? String(event.actor.name) : event.userId ?? '—'}</dd></div>
        <div><dt>Data</dt><dd>{new Date(event.createdAt).toLocaleString('pt-BR')}</dd></div>
      </dl>
      {event.unit && 'name' in event.unit ? <p className="audit-detail__unit"><strong>Unidade:</strong> {String(event.unit.name)}</p> : null}
      {event.before !== null ? (
        <section className="audit-detail__diff">
          <h4>Antes</h4><pre>{formatValue(event.before)}</pre>
        </section>
      ) : null}
      {event.after !== null ? (
        <section className="audit-detail__diff">
          <h4>Depois</h4><pre>{formatValue(event.after)}</pre>
        </section>
      ) : null}
      {event.reason ? <p className="audit-detail__reason"><strong>Motivo:</strong> {event.reason}</p> : null}
    </div>
  )
}

export function AuditPage({ session: _session }: { session: SessionContext }) {
  const [filters, setFilters] = useState<AuditEventFilters>({})
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditEventItem | null>(null)
  const pageSize = 20

  const query = useAuditEventsQuery(filters, page, pageSize)
  const totalPages = useMemo(() => query.data ? Math.max(1, Math.ceil(query.data.total / pageSize)) : 1, [query.data])

  return (
    <section className="audit-page module-panel" aria-labelledby="audit-title">
      <header className="module-panel__header">
        <div>
          <p className="page-eyebrow">Escopo estadual · trilha de auditoria</p>
          <h1 id="audit-title">Auditoria</h1>
          <p>Registro de eventos de segurança e alterações no sistema.</p>
        </div>
      </header>

      <form className="audit-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...filters }) }}>
        <label>Módulo
          <select aria-label="Filtrar por módulo" value={filters.module ?? ''} onChange={(event) => setFilters((current) => ({ ...current, module: event.target.value || undefined }))}>
            <option value="">Todos</option>
            {Object.entries(auditModuleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Resultado
          <select aria-label="Filtrar por resultado" value={filters.result ?? ''} onChange={(event) => setFilters((current) => ({ ...current, result: (event.target.value || undefined) as 'success' | 'failure' | undefined }))}>
            <option value="">Todos</option>
            <option value="success">Sucesso</option>
            <option value="failure">Falha</option>
          </select>
        </label>
        <button type="submit" className="button-link button-link--primary">Aplicar filtros</button>
      </form>

      {query.isLoading ? <LoadingState label="Carregando eventos de auditoria" /> : null}
      {query.isError ? <ErrorState message="Não foi possível carregar a auditoria." onRetry={() => { void query.refetch() }} /> : null}

      {!query.isLoading && !query.isError && query.data ? (
        <>
          <div className="audit-table-wrap" role="table" aria-label="Eventos de auditoria">
            <div className="audit-table__header" role="row">
              <span role="columnheader">Evento</span>
              <span role="columnheader">Módulo</span>
              <span role="columnheader">Resultado</span>
              <span role="columnheader">Autor</span>
              <span role="columnheader">Data</span>
            </div>
            {query.data.items.length ? query.data.items.map((event) => (
              <button type="button" className="audit-table__row" role="row" key={event.id} onClick={() => setSelected(event)}>
                <span role="cell"><strong>{actionLabels[event.action] ?? event.action}</strong></span>
                <span role="cell">{auditModuleLabels[event.module] ?? event.module}</span>
                <span role="cell" className={event.result === 'failure' ? 'text-danger' : ''}>{auditResultLabels[event.result] ?? event.result}</span>
                <span role="cell">{event.actor && 'name' in event.actor ? String(event.actor.name) : event.userId ?? '—'}</span>
                <span role="cell">{new Date(event.createdAt).toLocaleString('pt-BR')}</span>
              </button>
            )) : (
              <div className="audit-table__empty" role="row">
                <span role="cell"><EmptyState title="Nenhum evento de auditoria encontrado" description="Ajuste os filtros ou aguarde novos eventos serem registrados." /></span>
              </div>
            )}
          </div>

          <footer className="audit-pagination">
            <button type="button" className="button-link" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
            <span>Página {page} de {totalPages} · {query.data.total} eventos</span>
            <button type="button" className="button-link" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button>
          </footer>
        </>
      ) : null}

      <Modal open={Boolean(selected)} title="Detalhes do evento" ariaLabel="Detalhes do evento de auditoria" size="lg" onClose={() => setSelected(null)}>
        {selected ? <ActionDetail event={selected} /> : null}
      </Modal>
    </section>
  )
}