import { httpClient } from '../../../shared/api/httpClient'

export type OrganizationalKind = 'intermediate_command' | 'bpm' | 'cipm' | 'specialized_unit' | 'cime' | 'cipamb' | 'organic_company' | 'pel_dest' | 'ppd' | 'other'
export type OrganizationalVerificationStatus = 'confirmed' | 'divergent' | 'pending'

export type OrganizationalStructureQuery = {
  page?: number
  pageSize?: number
  search?: string
  commandId?: string
  unitId?: string
  kind?: OrganizationalKind
  verificationStatus?: OrganizationalVerificationStatus
  active?: boolean
}

export type OrganizationalStructureItem = {
  id: string
  name: string
  acronym: string
  kind: OrganizationalKind
  parentUnitId: string | null
  parent: { id: string; name: string; acronym: string } | null
  independent: boolean
  active: boolean
  verificationStatus: OrganizationalVerificationStatus
  childrenCount: number
  equipmentCount: number
  demonstrativeEquipmentCount: number
}

export type OrganizationalListResponse = { items: OrganizationalStructureItem[]; total: number; page: number; pageSize: number }
export type OrganizationalIndicators = {
  units: number
  equipment: { total: number; demonstrative: number }
  bySituation: Record<string, number>
  byType: Record<string, number>
  children: Array<{ id: string; name: string; equipment: number }>
}
export type OrganizationalDetailResponse = { organization: OrganizationalStructureItem; children: OrganizationalStructureItem[]; indicators: OrganizationalIndicators }
export type OrganizationalIndicatorsResponse = { scope: { id: string; name: string; acronym: string }; indicators: OrganizationalIndicators }
export type OrganizationalFilterOption = { id: string; name: string; acronym: string; kind: OrganizationalKind; parentUnitId: string | null; equipmentCount: number }
export type OrganizationalFilterOptionsResponse = {
  commands: Array<{ id: string; name: string; acronym: string; equipmentCount: number; units: OrganizationalFilterOption[] }>
  units: OrganizationalFilterOption[]
}

function queryString(query: OrganizationalStructureQuery) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return params.toString()
}

export function getOrganizationalStructure(query: OrganizationalStructureQuery = {}) {
  const suffix = queryString(query)
  return httpClient<OrganizationalListResponse>(`/admin/organizational-structure${suffix ? `?${suffix}` : ''}`)
}

export function getOrganizationalNode(organizationId: string) {
  return httpClient<OrganizationalDetailResponse>(`/admin/organizational-structure/${encodeURIComponent(organizationId)}`)
}

export function getOrganizationalIndicators(organizationId: string) {
  return httpClient<OrganizationalIndicatorsResponse>(`/admin/organizational-structure/${encodeURIComponent(organizationId)}/indicators`)
}

export function getOrganizationalFilterOptions() {
  return httpClient<OrganizationalFilterOptionsResponse>('/organizational-options')
}
