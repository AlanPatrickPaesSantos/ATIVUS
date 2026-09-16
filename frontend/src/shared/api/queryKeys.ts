import type { InventoryQuery, InventoryReportSituation } from './contracts'
import type { SessionContext } from '../auth/types'

function reportScope(session: SessionContext | null, query: { unitId?: string; situation?: InventoryReportSituation | null; period?: string | null }) {
  return {
    userId: session?.userId ?? null,
    unitId: session?.unit?.id ?? null,
    role: session?.role ?? null,
    reportUnitId: query.unitId ?? null,
    situation: query.situation ?? null,
    period: query.period ?? null,
  }
}

export const queryKeys = {
  dashboard: (session: SessionContext | null) => ['dashboard', {
    userId: session?.userId ?? null,
    unitId: session?.unit?.id ?? null,
    role: session?.role ?? null,
  }] as const,
  inventory: (query: InventoryQuery, session: SessionContext | null) => ['inventory', {
    userId: session?.userId ?? null,
    unitId: session?.unit?.id ?? null,
    role: session?.role ?? null,
    search: query.search ?? null,
    type: query.type ?? null,
    model: query.model ?? null,
    situation: query.situation ?? null,
    inventoryUnitId: query.unitId ?? null,
    page: query.page,
    pageSize: query.pageSize,
  }] as const,
  inventoryReport: (query: { unitId?: string; situation?: InventoryReportSituation | null; period?: string | null }, session: SessionContext | null) => ['reports', 'inventory-summary', reportScope(session, query)] as const,
  callsSummaryReport: (query: { unitId?: string; situation?: InventoryReportSituation | null; period?: string | null }, session: SessionContext | null) => ['reports', 'calls-summary', reportScope(session, query)] as const,
  movementsSummaryReport: (query: { unitId?: string; situation?: InventoryReportSituation | null; period?: string | null }, session: SessionContext | null) => ['reports', 'movements-summary', reportScope(session, query)] as const,
  generalReport: (query: { unitId?: string; situation?: InventoryReportSituation | null; period?: string | null }, session: SessionContext | null) => ['reports', 'general', reportScope(session, query)] as const,
}
