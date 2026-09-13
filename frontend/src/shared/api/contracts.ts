export type InventoryQuery = {
  search?: string
  type?: string
  model?: string
  situation?: string
  unitId?: string
  page: number
  pageSize: number
}

export type EquipmentSituation = 'active' | 'maintenance' | 'inactive' | 'lost' | 'written_off'

export type EquipmentSummary = {
  id: string
  patrimony: string
  type: string
  model: string
  brand: string
  situation: EquipmentSituation
  location: string
  unitName: string
}

export type EquipmentAllocation = {
  location: string
  responsibleUser?: string
  allocatedAt?: string
}

export type EquipmentHistoryEntry = {
  id: string
  description: string
  occurredAt: string
}

export type LinkedCall = {
  id: string
  subject: string
  status: string
  openedAt: string
}

export type LinkedDocument = {
  id: string
  name: string
  type: string
  size: number
  uploadedAt: string
  status: 'active'
  downloadUrl: string
}

export type EquipmentDetails = EquipmentSummary & {
  serialNumber?: string
  category: string
  warranty?: string
  observations?: string
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
  responsibleUser?: string
  allocation: EquipmentAllocation
  history: EquipmentHistoryEntry[]
  linkedCalls: LinkedCall[]
  documents: LinkedDocument[]
}

export type InventoryResponse = {
  items: EquipmentSummary[]
  total: number
  page: number
  pageSize: number
}

export type DashboardResponse = {
  equipmentTotal: number
  activeEquipmentTotal: number
  maintenanceEquipmentTotal: number
}

export type UnitContext = {
  id: string
  name: string
  acronym: string
}

export type InventoryReportSituation = EquipmentSituation

export type InventoryReportCounters = {
  total: number
  active: number
  maintenance: number
  inactive: number
  lost: number
  writtenOff: number
  attention: number
}

export type InventoryReportResponse = {
  report: {
    id: 'inventory-summary'
    title: string
    generatedAt: string
    scope: UnitContext
    filters: {
      situation: InventoryReportSituation | null
    }
  }
  totals: InventoryReportCounters
  units: Array<InventoryReportCounters & { unit: UnitContext }>
  generatedBy: {
    name: string
    role: 'ditel_admin' | 'unit_user'
  }
}
