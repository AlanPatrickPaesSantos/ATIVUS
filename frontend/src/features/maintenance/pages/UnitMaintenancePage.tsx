import { useMemo, useState } from 'react'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { Modal } from '../../../shared/ui/overlays/Modal'
import type { SessionContext } from '../../../shared/auth/types'
import { useMaintenanceQuery } from '../api/maintenanceQueries'
import type { MaintenanceItem, MaintenanceStatus } from '../api/maintenanceApi'
import { MaintenanceRequestModal } from '../components/MaintenanceRequestModal'
import { MaintenanceTable } from '../components/MaintenanceTable'
import { MaintenanceDetail } from '../components/MaintenanceDetail'

const statusLabels: Record<MaintenanceStatus, string> = {
  open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada',
}

export function UnitMaintenancePage({ session }: { session: SessionContext }) {
  const maintenanceQuery = useMaintenanceQuery()
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<MaintenanceItem | null>(null)

  const visibleItems = useMemo(() => (
    statusFilter === 'all' ? maintenanceQuery.data?.items ?? [] : maintenanceQuery.data?.items.filter((item) => item.status === statusFilter) ?? []
  ), [maintenanceQuery.data, statusFilter])

  return <section className="maintenance-page" data-testid="unit-maintenance-console" data-visual-variant="operation-night" aria-labelledby="maintenance-title">
    <header className="maintenance-page__header">
      <div>
        <p className="page-eyebrow">Acompanhamento técnico · Unidade autenticada</p>
        <h1 id="maintenance-title">Manutenção da Unidade</h1>
        <p>Acompanhe as intervenções dos equipamentos sob responsabilidade da sua Unidade.</p>
      </div>
      <div className="maintenance-page__actions">
        <button type="button" className="button-link button-link--primary" onClick={() => setCreating(true)}>+ Abrir manutenção</button>
      </div>
    </header>

    <div className="maintenance-page__filters" aria-label="Filtros de situação">
      <button type="button" className={statusFilter === 'all' ? 'is-active' : ''} onClick={() => setStatusFilter('all')}>Todas</button>
      {Object.entries(statusLabels).map(([value, label]) => <button key={value} type="button" className={statusFilter === value ? 'is-active' : ''} onClick={() => setStatusFilter(value as MaintenanceStatus)}>{label}</button>)}
    </div>

    {maintenanceQuery.isLoading ? <LoadingState label="Carregando manutenções da Unidade" /> : null}
    {maintenanceQuery.isError ? <ErrorState message="Não foi possível carregar as manutenções da Unidade." onRetry={() => { void maintenanceQuery.refetch() }} /> : null}
    {!maintenanceQuery.isLoading && !maintenanceQuery.isError ? <MaintenanceTable items={visibleItems} onSelect={setSelected} /> : null}

    <MaintenanceRequestModal open={creating} onClose={() => setCreating(false)} unitName={session.unit?.name ?? 'Unidade'} />

    <Modal open={Boolean(selected)} title="Detalhes da manutenção" ariaLabel="Detalhes da manutenção" size="md" onClose={() => setSelected(null)}>
      {selected ? <MaintenanceDetail item={selected} onClose={() => setSelected(null)} /> : null}
    </Modal>
  </section>
}