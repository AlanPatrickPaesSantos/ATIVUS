import type { SessionContext } from '../../../shared/auth/types'
import { QueryClientProvider } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queryClient } from '../../../app/providers'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { useDashboardQuery } from '../api/dashboardQueries'
import { UnitOperationalWorkspace } from '../components/UnitOperationalWorkspace'
import { UnitDashboardGrid } from '../components/UnitDashboardGrid'
import '../unit-dashboard.css'

type UnitDashboardPageProps = { session: SessionContext }

export function UnitDashboardPage({ session }: UnitDashboardPageProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <UnitDashboardContent session={session} />
    </QueryClientProvider>
  )
}

function UnitDashboardContent({ session }: UnitDashboardPageProps) {
  const dashboardQuery = useDashboardQuery()

  if (dashboardQuery.isError) {
    return <ErrorState message="Não foi possível carregar o painel da Unidade." onRetry={() => { void dashboardQuery.refetch() }} />
  }

  const unitName = dashboardQuery.data?.unit.name ?? session.unit?.name ?? 'Unidade'

  return (
    <section aria-labelledby="unit-dashboard-title" className="unit-dashboard-page">
      <header className="unit-dashboard-page__header">
        <div>
          <h1 id="unit-dashboard-title">Painel da Unidade</h1>
          <p>{unitName}</p>
        </div>
        <div className="unit-dashboard-page__actions">
          <Link className="button-link" to="/relatorios">Gerar relatório</Link>
          <Link className="button-link button-link--primary" to="/inventario">Cadastrar equipamento</Link>
        </div>
      </header>

      {dashboardQuery.isLoading ? (
        <LoadingState label="Carregando painel da Unidade" />
      ) : null}

      {dashboardQuery.data ? (
        <>
          {/* Seção de dashboards visual real */}
          <UnitDashboardGrid
            metrics={dashboardQuery.data.metrics}
            situations={dashboardQuery.data.situations}
            callsByStatus={dashboardQuery.data.callsByStatus ?? []}
            criticalCalls={dashboardQuery.data.criticalCalls ?? 0}
            pendingMovements={dashboardQuery.data.pendingMovements ?? 0}
            recentActivity={dashboardQuery.data.recentActivity}
          />

          {/* Área operacional secundária: Equipamentos da Unidade */}
          <UnitOperationalWorkspace />
        </>
      ) : null}
    </section>
  )
}
