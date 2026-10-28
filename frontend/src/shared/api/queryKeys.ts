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
  ac: {
    all: ['ac'] as const,
    materials: (query: { search?: string; page: number; pageSize: number }) => ['ac', 'materials', query] as const,
    material: (id: string) => ['ac', 'material', id] as const,
    transfers: (query: { page: number; pageSize: number }) => ['ac', 'transfers', query] as const,
    transfer: (id: string) => ['ac', 'transfer', id] as const,
    reports: (query: unknown) => ['ac', 'reports', 'patrimonial', query] as const,
  },
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
  organizationalStructure: (query: Record<string, unknown>) => ['organizational-structure', 'list', query] as const,
  organizationalNode: (id: string | null) => ['organizational-structure', 'node', id] as const,
  organizationalIndicators: (id: string | null) => ['organizational-structure', 'indicators', id] as const,
}
