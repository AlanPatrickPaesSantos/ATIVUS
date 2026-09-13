import { httpClient, httpDownload } from '../../../shared/api/httpClient'
import type { InventoryReportResponse, InventoryReportSituation } from '../../../shared/api/contracts'

export type InventoryReportQuery = {
  unitId?: string
  situation?: InventoryReportSituation | null
  period?: string | null
}

export type InventoryReportExportFormat = 'csv' | 'pdf'

function reportParameters(query: InventoryReportQuery & { format?: InventoryReportExportFormat }) {
  const parameters = new URLSearchParams()

  if (query.unitId) parameters.set('unitId', query.unitId)
  if (query.situation) parameters.set('situation', query.situation)
  if (query.period) parameters.set('period', query.period)
  if (query.format) parameters.set('format', query.format)

  return parameters.toString()
}

export function getInventoryReport(query: InventoryReportQuery) {
  const queryString = reportParameters(query)
  return httpClient<InventoryReportResponse>(`/reports/inventory-summary${queryString ? `?${queryString}` : ''}`)
}

export function downloadInventoryReportExport(query: InventoryReportQuery & { format: InventoryReportExportFormat }) {
  return httpDownload(`/reports/inventory-summary/export?${reportParameters(query)}`)
}
