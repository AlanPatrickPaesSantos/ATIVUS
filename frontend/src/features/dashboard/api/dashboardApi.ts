import { httpClient } from '../../../shared/api/httpClient'
import { getSession } from '../../../shared/auth/session'
import type { SessionContext } from '../../../shared/auth/types'
import type { DashboardFilters } from '../../../shared/api/contracts'

export type UnitContext = NonNullable<SessionContext['unit']>

export type SituationCount = {
  situation: 'active' | 'maintenance' | 'attention' | 'inactive' | 'lost' | 'written_off'
  label: string
  count: number
}

export type Activity = {
  id: string
  description: string
  occurredAt: string
}

export type UnitDashboard = {
  unit: UnitContext
  metrics: {
    total: number
    active: number
    maintenance: number
    attention: number
  }
  situations: SituationCount[]
  unitSummaries?: Array<{
    unit: UnitContext
    coverage: string
    equipmentShare?: string
    patrimonialCoverage?: string | null
    equipment: number
    attention: number
    organizationType?: 'intermediate_command' | 'subordinate_unit'
  }>
  callsByStatus?: Array<{
    status: string
    label: string
    count: number
  }>
  criticalCalls?: number
  pendingMovements?: number
  monitoredUnits?: number
  recentMovements?: Array<{
    id: string
    equipmentId: string
    origin: UnitContext
    destination: UnitContext
    status: string
    occurredAt: string
  }>
  recentActivity: Activity[]
}

type LegacyDashboardResponse = {
  equipmentTotal: number
  activeEquipmentTotal: number
  maintenanceEquipmentTotal: number
}

function isUnitDashboard(response: UnitDashboard | LegacyDashboardResponse): response is UnitDashboard {
  return 'metrics' in response
}

function dashboardUrl(filters: DashboardFilters = {}) {
  const parameters = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) parameters.set(key, value)
  })
  const query = parameters.toString()
  return query ? `/dashboard?${query}` : '/dashboard'
}

export function getUnitDashboard(filters: DashboardFilters = {}): Promise<UnitDashboard> {
  const unit = getSession()?.unit
  if (!unit) {
    return Promise.reject(new Error('Uma sessão autenticada de Unidade é obrigatória.'))
  }

  return httpClient<UnitDashboard | LegacyDashboardResponse>(dashboardUrl(filters)).then((response) => {
    if (isUnitDashboard(response)) return response

    return {
      unit,
      metrics: {
        total: response.equipmentTotal,
        active: response.activeEquipmentTotal,
        maintenance: response.maintenanceEquipmentTotal,
        attention: 0,
      },
      situations: [
        { situation: 'active', label: 'Em operação', count: response.activeEquipmentTotal },
        { situation: 'maintenance', label: 'Em manutenção', count: response.maintenanceEquipmentTotal },
        { situation: 'inactive', label: 'Inativos', count: 0 },
        { situation: 'attention', label: 'Requer atenção', count: 0 },
      ],
      recentActivity: [],
    }
  })
}

export function getDashboard(filters: DashboardFilters = {}): Promise<UnitDashboard> {
  const session = getSession()
  if (!session) {
    return Promise.reject(new Error('Uma sessão autenticada é obrigatória.'))
  }

  if (session.role === 'ditel_admin') {
    return httpClient<UnitDashboard>(dashboardUrl(filters)).then((response) => ({
      unit: response.unit,
      metrics: response.metrics,
      situations: response.situations ?? [],
      ...(response.unitSummaries ? { unitSummaries: response.unitSummaries } : {}),
      ...(response.callsByStatus ? { callsByStatus: response.callsByStatus } : {}),
      ...(response.criticalCalls !== undefined ? { criticalCalls: response.criticalCalls } : {}),
      ...(response.pendingMovements !== undefined ? { pendingMovements: response.pendingMovements } : {}),
      ...(response.monitoredUnits !== undefined ? { monitoredUnits: response.monitoredUnits } : {}),
      ...(response.recentMovements ? { recentMovements: response.recentMovements } : {}),
      recentActivity: response.recentActivity ?? [],
    }))
  }

  return getUnitDashboard(filters)
}
