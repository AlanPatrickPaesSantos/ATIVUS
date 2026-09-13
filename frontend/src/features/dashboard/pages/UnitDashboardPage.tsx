import type { SessionContext } from '../../../shared/auth/types'
import { QueryClientProvider } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queryClient } from '../../../app/providers'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'
import { ErrorState } from '../../../shared/ui/feedback/ErrorState'
import { LoadingState } from '../../../shared/ui/feedback/LoadingState'
import { useDashboardQuery } from '../api/dashboardQueries'
import { UnitOperationalWorkspace } from '../components/UnitOperationalWorkspace'
import { UnitMetricCards } from '../components/UnitMetricCards'

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
          <p className="page-eyebrow">Controle patrimonial · Unidade autenticada</p>
          <h1 id="unit-dashboard-title">Painel da Unidade</h1>
          <p>{unitName} · visão atualizada do inventário e das pendências operacionais.</p>
        </div>
        <div className="unit-dashboard-page__actions"><Link className="button-link" to="/relatorios">Gerar relatório</Link><Link className="button-link button-link--primary" to="/inventario">Cadastrar equipamento</Link></div>
      </header>
      {dashboardQuery.isLoading ? <LoadingState label="Carregando painel da Unidade" /> : null}
      {dashboardQuery.data ? (
        <>
          <UnitMetricCards metrics={dashboardQuery.data.metrics} inactive={dashboardQuery.data.situations.find((item) => item.situation === 'inactive')?.count} />
          {dashboardQuery.data.metrics.total === 0 ? <EmptyState title="Nenhum equipamento cadastrado" description="Quando houver equipamentos no inventário desta Unidade, o resumo será exibido aqui." /> : null}
          <UnitOperationalWorkspace situations={dashboardQuery.data.situations} activity={dashboardQuery.data.recentActivity} />
        </>
      ) : null}
    </section>
  )
}
