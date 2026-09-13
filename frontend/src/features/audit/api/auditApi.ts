import { httpClient } from '../../../shared/api/httpClient'

export type AuditEventItem = {
  id: string
  action: string
  module: string
  userId: string | null
  actor: Record<string, unknown> | null
  entity: { type?: string; id?: string; label?: string } | Record<string, unknown> | null
  unit: Record<string, unknown> | null
  result: 'success' | 'failure'
  reason: string | null
  before: unknown
  after: unknown
  retentionExpiresAt: string | null
  createdAt: string
  updatedAt: string
}

export type AuditEventFilters = {
  action?: string
  module?: string
  result?: 'success' | 'failure'
  userId?: string
  unitId?: string
  entityType?: string
  entityId?: string
  from?: string
  to?: string
}

export type AuditEventsResponse = {
  items: AuditEventItem[]
  total: number
  page: number
  pageSize: number
}

export async function getAuditEvents(filters: AuditEventFilters = {}, page = 1, pageSize = 20): Promise<AuditEventsResponse> {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.module) params.set('module', filters.module)
  if (filters.result) params.set('result', filters.result)
  if (filters.userId) params.set('userId', filters.userId)
  if (filters.unitId) params.set('unitId', filters.unitId)
  if (filters.entityType) params.set('entityType', filters.entityType)
  if (filters.entityId) params.set('entityId', filters.entityId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  return httpClient<AuditEventsResponse>(`/audit-events?${params.toString()}`)
}

export const auditModuleLabels: Record<string, string> = {
  auth: 'Autenticação',
  calls: 'Chamados',
  equipment: 'Equipamentos',
  maintenance: 'Manutenção',
  missions: 'Missões técnicas',
  inventory: 'Inventário',
  admin: 'Administração',
}

export const auditResultLabels: Record<string, string> = {
  success: 'Sucesso',
  failure: 'Falha',
}