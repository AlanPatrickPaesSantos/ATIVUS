import { httpClient, httpDownload } from '../../../shared/api/httpClient'
import type { AcMaterial, AcMaterialCreateInput, AcMaterialQuery, AcMaterialsResponse, AcPatrimonialReportQuery, AcPatrimonialReportResponse, AcTransfer, AcTransferCreateInput, AcTransfersResponse } from '../../../shared/api/contracts'

export function getAcMaterials(query: AcMaterialQuery) {
  const parameters = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) })
  if (query.search?.trim()) parameters.set('search', query.search.trim())
  return httpClient<AcMaterialsResponse>(`/ac/materials?${parameters.toString()}`)
}

export function getAcMaterial(id: string) {
  return httpClient<AcMaterial>(`/ac/materials/${encodeURIComponent(id)}`)
}

export function createAcMaterial(input: AcMaterialCreateInput) {
  return httpClient<AcMaterial>('/ac/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
}

export function createAcTransfer(input: AcTransferCreateInput, idempotencyKey: string) {
  return httpClient<AcTransfer>('/ac/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) })
}

export function getAcTransfers(query: { page: number; pageSize: number }) {
  return httpClient<AcTransfersResponse>(`/ac/transfers?page=${query.page}&pageSize=${query.pageSize}`)
}

export function getAcTransfer(id: string) {
  return httpClient<AcTransfer>(`/ac/transfers/${encodeURIComponent(id)}`)
}

export function getAcTransferDocument(id: string, format: 'docx' | 'pdf') {
  return httpDownload(`/ac/transfers/${encodeURIComponent(id)}/document?format=${format}`)
}

export function getAcPatrimonialReport(query: AcPatrimonialReportQuery) {
  const parameters = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), ...(query.sort ? { sort: query.sort } : {}), ...(query.order ? { order: query.order } : {}) })
  for (const key of ['from', 'to', 'unitId', 'patrimony', 'type', 'model', 'situation', 'bg'] as const) {
    const value = query[key]
    if (value) parameters.set(key, value)
  }
  return httpClient<AcPatrimonialReportResponse>(`/ac/reports/patrimonial?${parameters.toString()}`)
}
