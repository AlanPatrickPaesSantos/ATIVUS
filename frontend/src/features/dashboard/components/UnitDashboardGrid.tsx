import type { Activity, SituationCount } from '../api/dashboardApi'
import { UnitCallsBarChart } from './UnitCallsBarChart'
import { UnitEvolutionChart } from './UnitEvolutionChart'
import { UnitKpiCards } from './UnitKpiCards'
import { UnitOperationsCenter } from './UnitOperationsCenter'
import { UnitParkDonutChart } from './UnitParkDonutChart'

export type UnitDashboardGridProps = {
  metrics: {
    total: number
    active: number
    maintenance: number
    attention: number
  }
  situations: SituationCount[]
  callsByStatus?: Array<{ status: string; label: string; count: number }>
  criticalCalls?: number
  pendingMovements?: number
  recentActivity?: Activity[]
}

export function UnitDashboardGrid({
  metrics,
  situations,
  callsByStatus = [],
  criticalCalls = 0,
  pendingMovements = 0,
  recentActivity = [],
}: UnitDashboardGridProps) {
  return (
    <section className="unit-dashboard-grid" aria-labelledby="unit-dashboards-section-title">
      <UnitKpiCards metrics={metrics} />
      <div className="unit-dashboard-grid__main">
        <UnitParkDonutChart situations={situations} total={metrics.total} />
        <UnitOperationsCenter
          total={metrics.total}
          active={metrics.active}
          maintenance={metrics.maintenance}
          attention={metrics.attention}
          criticalCalls={criticalCalls}
          pendingMovements={pendingMovements}
          recentActivityCount={recentActivity.length}
        />
      </div>
      <div className="unit-dashboard-grid__bottom">
        <UnitCallsBarChart callsByStatus={callsByStatus} />
        <UnitEvolutionChart recentActivity={recentActivity} />
      </div>
    </section>
  )
}
