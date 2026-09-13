import { httpClient } from '../../../shared/api/httpClient'

export type UnitOption = { id: string; name: string; acronym: string }
export type UnitsResponse = { items: UnitOption[] }

export function getUnits() {
  return httpClient<UnitsResponse>('/units')
}
