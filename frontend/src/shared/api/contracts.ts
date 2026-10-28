export type InventoryQuery = {
  search?: string
  type?: string
  model?: string
  situation?: string
  unitId?: string
  commandId?: string
  municipality?: string
  region?: string
  section?: string
  period?: DashboardPeriod
  page: number
  pageSize: number
}

export type EquipmentSituation = 'active' | 'maintenance' | 'inactive' | 'lost' | 'written_off'
export type DashboardSituation = EquipmentSituation | 'attention'
export type DashboardPeriod = '30d' | '90d' | '2026-08'

export type DashboardFilters = {
  unitId?: string
  commandId?: string
  situation?: DashboardSituation
  municipality?: string
  region?: string
  type?: string
  model?: string
  section?: string
  period?: DashboardPeriod
}

export type EquipmentSummary = {
  id: string
  patrimony: string
  type: string
  model: string
  brand: string
  situation: EquipmentSituation
  location: string
  unitName: string | null
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

export type InventoryFacetsResponse = {
  units: UnitContext[]
  types: string[]
  models: string[]
  situations: EquipmentSituation[]
  municipalities: string[]
  regions: string[]
  sections: string[]
}

export type AcMaterial = {
  id: string
  patrimony: string
  type: string
  model: string
  brand: string
  situation: EquipmentSituation
  location: string
  unit: null
  custody: { scope: 'AC'; unit: null }
  serialNumber?: string
  category: string
  warranty?: string
  observations?: string
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
  history: EquipmentHistoryEntry[]
}

export type AcMaterialQuery = { search?: string; page: number; pageSize: number }
export type AcMaterialsResponse = { items: AcMaterial[]; total: number; page: number; pageSize: number }
export type AcMaterialCreateInput = Pick<AcMaterial, 'patrimony' | 'type' | 'model' | 'brand' | 'situation' | 'location' | 'category'> & Pick<AcMaterial, 'serialNumber' | 'warranty' | 'observations'>

export type AcTransferPerson = { name: string; registration?: string }
export type AcTransferMaterial = { equipmentId: string; patrimony: string; description?: string; identification?: string; model?: string; serialNumber?: string; sourceCustody: { scope: 'AC'; unit: null }; equipmentUpdatedAt: string; equipmentVersion: number }
export type AcTransfer = { id: string; origin: 'AC'; status: 'confirmed'; destinationUnit: UnitContext; distributedAt: string; deliverer: AcTransferPerson; receiver: AcTransferPerson; bg?: { number: string }; materials: AcTransferMaterial[]; createdAt: string; createdBy: string }
export type AcTransferCreateInput = { destinationUnit: UnitContext; distributedAt: string; deliverer: AcTransferPerson; receiver: AcTransferPerson; bg?: { number: string }; equipmentIds: string[] }
export type AcTransfersResponse = { items: AcTransfer[]; total: number; page: number; pageSize: number }

export type AcPatrimonialReportQuery = {
  from?: string; to?: string; unitId?: string; patrimony?: string; type?: string; model?: string; situation?: EquipmentSituation; bg?: string
  page: number; pageSize: number; sort?: 'distributedAt' | 'patrimony' | 'destinationUnit'; order?: 'asc' | 'desc'
}
export type AcPatrimonialStockItem = { id: string; patrimony: string; serialNumber: string | null; identification: string; brand: string; type: string; model: string; situation: EquipmentSituation }
export type AcPatrimonialDistribution = { id: string; distributedAt: string; destinationUnit: UnitContext; deliverer: AcTransferPerson; receiver: AcTransferPerson; quantity: number; bg?: { number: string } }
export type AcPatrimonialHistoryEntry = { id: string; source: 'AC' | 'DITEL'; description: string; occurredAt: string; bg?: string | null }
export type AcPatrimonialReportResponse = {
  generatedAt: string; generatedBy: { name: string; role: 'ac_operator' | 'ditel_admin' }
  metrics: { availableStock: number; distributedGoods: number; transfers: number }
  criteria: { availableStock: string; distributedGoods: string; transfers: string }
  stock: { items: AcPatrimonialStockItem[]; total: number; page: number; pageSize: number }
  distributions: { items: AcPatrimonialDistribution[]; total: number; page: number; pageSize: number }
  history: { patrimony: string; entries: AcPatrimonialHistoryEntry[] } | null
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

export type ReportGeneratedBy = { name: string; role: 'ditel_admin' | 'unit_user' }

export type CallsSummaryReportResponse = {
  report: {
    id: 'calls-summary'
    title: string
    generatedAt: string
    scope: UnitContext
    filters: Record<string, never>
  }
  totals: {
    total: number
    open: number
    critical: number
    attention: number
    resolved: number
  }
  byStatus: Array<{ status: string; count: number }>
  byPriority: Array<{ priority: string; count: number }>
  generatedBy: ReportGeneratedBy
}

export type MovementsSummaryReportResponse = {
  report: {
    id: 'movements-summary'
    title: string
    generatedAt: string
    scope: UnitContext
    filters: Record<string, never>
  }
  totals: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  byStatus: Array<{ status: string; count: number }>
  generatedBy: ReportGeneratedBy
}

export type GeneralReportResponse = {
  report: {
    id: 'general'
    title: string
    generatedAt: string
    scope: UnitContext
    filters: {
      situation: InventoryReportSituation | null
    }
  }
  inventory: {
    totals: InventoryReportCounters
    units: Array<InventoryReportCounters & { unit: UnitContext }>
  }
  calls: {
    totals: CallsSummaryReportResponse['totals']
    byStatus: CallsSummaryReportResponse['byStatus']
    byPriority: CallsSummaryReportResponse['byPriority']
  }
  movements: {
    totals: MovementsSummaryReportResponse['totals']
    byStatus: MovementsSummaryReportResponse['byStatus']
  }
  generatedBy: ReportGeneratedBy
}
