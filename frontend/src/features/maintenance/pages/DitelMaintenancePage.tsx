import { useMemo, useState } from 'react'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { SessionContext } from '../../../shared/auth/types'
import { useMaintenanceQuery } from '../api/maintenanceQueries'
import type { MaintenanceItem, MaintenanceStatus } from '../api/maintenanceApi'
import { MaintenanceProgressModal } from '../components/MaintenanceProgressModal'
import { MaintenanceTable } from '../components/MaintenanceTable'

const statusLabels: Record<MaintenanceStatus, string> = {
  open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada',
}

export function DitelMaintenancePage({ session: _session }: { session: SessionContext }) {
  const maintenanceQuery = useMaintenanceQuery()
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | 'all'>('all')
  const [selected, setSelected] = useState<MaintenanceItem | null>(null)

  const visibleItems = useMemo(() => (
    statusFilter === 'all' ? maintenanceQuery.data?.items ?? [] : maintenanceQuery.data?.items.filter((item) => item.status === statusFilter) ?? []
  ), [maintenanceQuery.data, statusFilter])

  const total = maintenanceQuery.data?.items.length ?? 0

  return <section className="maintenance-page" data-testid="ditel-maintenance-console" data-visual-variant="statewide-governance-console" aria-labelledby="maintenance-title">
    <header className="maintenance-page__header">
      <div>
        <p className="page-eyebrow">Acompanhamento técnico · escopo estadual</p>
        <h1 id="maintenance-title">Manutenções DITEL</h1>
        <p>Acompanhe e conclua as intervenções de todas as Unidades do Estado.</p>
      </div>
      <span className="module-total" role="status">{total} {total === 1 ? 'registro' : 'registros'}</span>
    </header>

    <div className="maintenance-page__filters" aria-label="Filtros de situação">
      <button type="button" className={statusFilter === 'all' ? 'is-active' : ''} onClick={() => setStatusFilter('all')}>Todas</button>
      {Object.entries(statusLabels).map(([value, label]) => <button key={value} type="button" className={statusFilter === value ? 'is-active' : ''} onClick={() => setStatusFilter(value as MaintenanceStatus)}>{label}</button>)}
    </div>

    {maintenanceQuery.isLoading ? <LoadingState label="Carregando manutenções do Estado" /> : null}
    {maintenanceQuery.isError ? <ErrorState message="Não foi possível carregar as manutenções do Estado." onRetry={() => { void maintenanceQuery.refetch() }} /> : null}
    {!maintenanceQuery.isLoading && !maintenanceQuery.isError && visibleItems.length === 0
      ? <EmptyState title="Nenhuma manutenção encontrada" description={statusFilter === 'all' ? 'Não há intervenções registradas no Estado até o momento.' : `Não há manutenções ${statusLabels[statusFilter].toLowerCase()} registradas.`} />
      : null}
    {!maintenanceQuery.isLoading && !maintenanceQuery.isError && visibleItems.length > 0 ? <MaintenanceTable items={visibleItems} onSelect={setSelected} actionLabel="Atualizar" /> : null}

    <Modal open={Boolean(selected)} title="Atualizar manutenção" ariaLabel="Atualizar manutenção DITEL" size="md" onClose={() => setSelected(null)}>
      {selected ? <MaintenanceProgressModal item={selected} onClose={() => setSelected(null)} /> : null}
    </Modal>
  </section>
}