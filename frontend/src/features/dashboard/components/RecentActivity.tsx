import type { Activity } from '../api/dashboardApi'
import { EmptyState } from '../../../shared/ui/feedback/EmptyState'

type RecentActivityProps = {
  activity: Activity[]
}

export function RecentActivity({ activity }: RecentActivityProps) {
  return (
    <section aria-labelledby="recent-activity-title" className="dashboard-panel recent-activity">
      <div>
        <h2 id="recent-activity-title">Atividade recente</h2>
        <p>Últimas atualizações registradas no inventário da Unidade.</p>
      </div>
      {activity.length === 0 ? <EmptyState title="Nenhuma atividade recente" description="As próximas atualizações do inventário aparecerão aqui." /> : (
        <ol>
          {activity.map((item) => (
            <li key={item.id}>
              <p>{item.description}</p>
              <time>{item.occurredAt}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
