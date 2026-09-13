import { http, HttpResponse } from 'msw'
import { clearSession, getSession } from '../../../shared/auth/session'
import type { EquipmentDetails, EquipmentSummary, EquipmentSituation } from '../contracts'
import { MAX_ATTACHMENT_SIZE_BYTES, MAX_ATTACHMENT_SIZE_LABEL, MAX_CALL_ATTACHMENTS, type CallDetails, type CallHistoryEntry, type CallQueueItem, type ResponsibleSection } from '../../../features/calls/api/callsApi'
import { CALL_ATTACHMENT_RULES, EQUIPMENT_ATTACHMENT_RULES, isAllowedAttachmentFile } from '../attachmentValidation'
import { ditelFixture } from '../../fixtures/moduleFixtures'
import type { AdminUserApi } from '../../../features/administration/api/administrationApi'
import type { SessionContext } from '../../../shared/auth/types'

type FixtureEquipment = EquipmentSummary & { unitId: string }
type MockDocument = EquipmentDetails['documents'][number]

const equipment: FixtureEquipment[] = [
  { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola', situation: 'active', location: 'Sala de Comunicações', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-002', patrimony: 'PAT-2026-004822', type: 'Colete balístico', model: 'Defesa MD-3A', brand: 'Defesa', situation: 'active', location: '3º BPM', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-003', patrimony: 'PAT-2026-004823', type: 'Veículo', model: 'Hilux 4x4', brand: 'Toyota', situation: 'active', location: 'Garagem 3º BPM', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-004', patrimony: 'PAT-2026-004824', type: 'GPS portátil', model: '66i', brand: 'Garmin', situation: 'maintenance', location: 'CME', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-005', patrimony: 'PAT-2026-004825', type: 'Drone', model: 'Mavic 2 Enterprise', brand: 'DJI', situation: 'active', location: '3º BPM', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-006', patrimony: 'PAT-2026-004826', type: 'Lanterna tática', model: 'TA30', brand: 'Nextorch', situation: 'active', location: '3º BPM', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-007', patrimony: 'PAT-2026-004827', type: 'Computador portátil', model: 'Latitude 5420', brand: 'Dell', situation: 'active', location: 'Comando', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-008', patrimony: 'PAT-2026-004828', type: 'Impressora', model: 'LaserJet M404', brand: 'HP', situation: 'inactive', location: 'Almoxarifado', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-009', patrimony: 'PAT-2026-004829', type: 'Switch', model: 'SG1024D', brand: 'TP-Link', situation: 'active', location: 'Sala de TI', unitId: 'unit-centro', unitName: '3º BPM' },
  { id: 'eq-101', patrimony: 'UN-001', type: 'Notebook', model: 'ProBook', brand: 'HP', situation: 'active', location: 'Recepção', unitId: 'unit-norte', unitName: 'Unidade Norte' },
]

const recentActivityByUnit = {
  'unit-centro': [{ id: 'activity-unit-centro-1', description: 'Inventário do 3º BPM atualizado.', occurredAt: 'Hoje, 09:30' }],
  'unit-norte': [{ id: 'activity-unit-norte-1', description: 'Inventário da Unidade Norte atualizado.', occurredAt: 'Hoje, 10:15' }],
} as const

type MswMaintenance = {
  id: string
  equipment: { id: string; patrimony: string; type: string; model: string; brand: string }
  unit: { id: string; name: string; acronym: string }
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  type: 'corrective' | 'preventive'
  description: string
  diagnosis?: string
  service?: string
  technicalResponsible?: string
  observations?: string
  openedAt: string
  updatedAt: string
  completedAt?: string
}
const initialMaintenance = (): MswMaintenance[] => [
  {
    id: 'mnt-001', equipment: { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' },
    unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, status: 'open', type: 'corrective',
    description: 'Rádio sem transmissão.', openedAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: 'mnt-002', equipment: { id: 'eq-004', patrimony: 'PAT-2026-004824', type: 'GPS portátil', model: '66i', brand: 'Garmin' },
    unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, status: 'in_progress', type: 'preventive',
    description: 'Revisão preventiva do GPS.', diagnosis: 'Limpeza e atualização de firmware.', openedAt: '2026-08-18T09:00:00.000Z', updatedAt: '2026-09-01T14:00:00.000Z',
  },
  {
    id: 'mnt-003', equipment: { id: 'eq-101', patrimony: 'UN-001', type: 'Notebook', model: 'ProBook', brand: 'HP' },
    unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, status: 'completed', type: 'corrective',
    description: 'Notebook não liga.', diagnosis: 'Fonte de alimentação defeituosa.', service: 'Substituição da fonte.', technicalResponsible: 'Equipe DITEL',
    openedAt: '2026-08-25T08:00:00.000Z', updatedAt: '2026-09-05T16:00:00.000Z', completedAt: '2026-09-05T16:00:00.000Z',
  },
]

const initialEquipmentTypes = (): Array<{ id: string; name: string; description: string; active: boolean; createdAt: string; updatedAt: string }> => [
  { id: 'et-001', name: 'Rádio portátil', description: 'Comunicação tática portátil', active: true, createdAt: '2026-01-05T09:00:00.000Z', updatedAt: '2026-01-05T09:00:00.000Z' },
  { id: 'et-002', name: 'Notebook', description: 'Estação de trabalho móvel', active: true, createdAt: '2026-01-05T09:05:00.000Z', updatedAt: '2026-01-05T09:05:00.000Z' },
  { id: 'et-003', name: 'GPS portátil', description: 'Navegação e georreferenciamento', active: true, createdAt: '2026-01-05T09:10:00.000Z', updatedAt: '2026-01-05T09:10:00.000Z' },
]

const initialMissions = (): Array<{
  id: string; title: string; description: string; type: string; status: string; priority: string
  unit: { id: string; name: string; acronym?: string }
  equipment: Array<{ id: string; patrimony: string; type: string; model: string; brand: string }>
  assignedBy: { id: string; name: string; registration: string }
  assignedTo: { id: string; name: string; registration: string }
  startedAt: string | null; completedAt: string | null
  notes: Array<{ author: string; text: string; createdAt: string }>
  createdAt: string; updatedAt: string
}> => [
  {
    id: 'mis-001', title: 'Instalar rádio na Sala de Comunicações', description: 'Instalação de rádio móvel no posto de comando.', type: 'installation', status: 'assigned', priority: 'high',
    unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' },
    equipment: [{ id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' }],
    assignedBy: { id: 'ditel-1', name: 'Carlos Lima', registration: '200001' },
    assignedTo: { id: 'unit-centro', name: '3º BPM', registration: '100001' },
    startedAt: null, completedAt: null, notes: [],
    createdAt: '2026-09-10T09:00:00.000Z', updatedAt: '2026-09-10T09:00:00.000Z',
  },
  {
    id: 'mis-002', title: 'Revisão preventiva de GPS', description: 'Limpeza e atualização de firmware dos GPS da unidade.', type: 'maintenance', status: 'in_progress', priority: 'medium',
    unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' },
    equipment: [{ id: 'eq-004', patrimony: 'PAT-2026-004824', type: 'GPS portátil', model: '66i', brand: 'Garmin' }],
    assignedBy: { id: 'ditel-1', name: 'Carlos Lima', registration: '200001' },
    assignedTo: { id: 'unit-centro', name: '3º BPM', registration: '100001' },
    startedAt: '2026-09-11T08:00:00.000Z', completedAt: null,
    notes: [{ author: 'Ana Souza', text: 'Iniciada limpeza dos equipamentos.', createdAt: '2026-09-11T08:30:00.000Z' }],
    createdAt: '2026-09-10T14:00:00.000Z', updatedAt: '2026-09-11T08:30:00.000Z',
  },
]

const initialAuditEvents = (): Array<{
  id: string; action: string; module: string; userId: string; result: 'success' | 'failure'
  actor: { id: string; name: string; registration: string } | null
  entity: { type: string; id: string; label: string } | null
  unit: { id: string; name: string } | null
  reason: string | null; before: unknown; after: unknown
  retentionExpiresAt: string | null; createdAt: string; updatedAt: string
}> => [
  {
    id: 'aud-001', action: 'maintenance.update', module: 'maintenance', userId: 'ditel-1', result: 'success',
    actor: { id: 'ditel-1', name: 'Carlos Lima', registration: '200001' },
    entity: { type: 'maintenance', id: 'mnt-001', label: 'Manutenção #1' },
    unit: { id: 'unit-centro', name: '3º BPM' },
    reason: null,
    before: { status: 'open', diagnosis: null, service: null },
    after: { status: 'completed', diagnosis: 'Falha no módulo', service: 'Substituição' },
    retentionExpiresAt: null, createdAt: '2026-09-12T15:30:00.000Z', updatedAt: '2026-09-12T15:30:00.000Z',
  },
  {
    id: 'aud-002', action: 'login.success', module: 'auth', userId: 'unit-1', result: 'success',
    actor: { id: 'unit-1', name: 'Ana Souza', registration: '100001' },
    entity: null, unit: { id: 'unit-centro', name: '3º BPM' },
    reason: null, before: null, after: null,
    retentionExpiresAt: null, createdAt: '2026-09-12T08:00:00.000Z', updatedAt: '2026-09-12T08:00:00.000Z',
  },
  {
    id: 'aud-003', action: 'login.failure', module: 'auth', userId: 'unit-2', result: 'failure',
    actor: { id: 'unit-2', name: 'Bruno Lima', registration: '3456789' },
    entity: null, unit: { id: 'unit-norte', name: 'Unidade Norte' },
    reason: 'Senha inválida', before: null, after: null,
    retentionExpiresAt: null, createdAt: '2026-09-12T08:05:00.000Z', updatedAt: '2026-09-12T08:05:00.000Z',
  },
]

function mockDocument(id: string, name: string, type = 'application/pdf'): MockDocument {
  return { id, name, type, size: 1024, uploadedAt: '2026-08-30T08:00:00.000Z', status: 'active', downloadUrl: `/api/v1/attachments/${id}/download` }
}

const detailsByEquipment: Record<string, Omit<EquipmentDetails, keyof EquipmentSummary>> = {
  'eq-001': { category: 'Comunicação', serialNumber: 'APX2K26F7Q01234', warranty: 'Até 12/03/2027', observations: 'Rádio destinado à Sala de Comunicações.', createdAt: '2026-01-10', createdBy: 'Cb PM João Silva', updatedAt: '2026-05-15', updatedBy: 'Sgt PM Alves', allocation: { location: 'Sala de Comunicações', responsibleUser: 'Cb PM João Silva', allocatedAt: '2026-02-18' }, history: [{ id: 'history-001', description: 'Transferido de CME para 3º BPM.', occurredAt: '2026-01-10' }], linkedCalls: [{ id: 'CH-2026-01572', subject: 'Falha intermitente no áudio', status: 'Aberto', openedAt: '2026-05-10' }], documents: [mockDocument('manual-apx', 'Manual_APX2000.pdf'), mockDocument('certificado-anatel', 'Certificado_Anatel.pdf')] },
  'eq-002': { category: 'Proteção', serialNumber: 'DEF3A26004822', allocation: { location: '3º BPM', responsibleUser: 'Guarda da Unidade' }, history: [], linkedCalls: [], documents: [] },
  'eq-003': { category: 'Transporte', serialNumber: 'TOY4X426004823', allocation: { location: 'Garagem 3º BPM', responsibleUser: 'Equipe de viaturas' }, history: [], linkedCalls: [], documents: [] },
  'eq-004': { category: 'Navegação', serialNumber: 'GRM6626004824', allocation: { location: 'CME' }, history: [{ id: 'history-004', description: 'Encaminhado para manutenção preventiva.', occurredAt: '2026-08-18' }], linkedCalls: [], documents: [mockDocument('ficha-gps', 'Ficha patrimonial.pdf')] },
  'eq-005': { category: 'Operações aéreas', serialNumber: 'DJIM226004825', allocation: { location: '3º BPM' }, history: [], linkedCalls: [], documents: [] },
  'eq-006': { category: 'Apoio operacional', serialNumber: 'NXT3026004826', allocation: { location: '3º BPM' }, history: [], linkedCalls: [], documents: [] },
  'eq-007': { category: 'Informática', serialNumber: 'DLL542026004827', allocation: { location: 'Comando' }, history: [], linkedCalls: [], documents: [] },
  'eq-008': { category: 'Impressão', serialNumber: 'HPM40426004828', allocation: { location: 'Almoxarifado' }, history: [], linkedCalls: [], documents: [] },
  'eq-009': { category: 'Rede', serialNumber: 'TPL102426004829', allocation: { location: 'Sala de TI' }, history: [], linkedCalls: [], documents: [] },
  'eq-101': { category: 'Informática', serialNumber: 'HP-UN-001', allocation: { location: 'Recepção' }, history: [], linkedCalls: [], documents: [] },
}

const units = [
  { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
  { id: 'unit-sul', name: 'Unidade Sul', acronym: 'US' },
]

type MswMovement = { id: string; type: 'Transferência definitiva'; equipmentId: string; origin: { id: string; name: string; acronym: string }; destination: { id: string; name: string; acronym: string }; requestedBy: string; status: 'Pendente' | 'Aprovada' | 'Rejeitada'; decisionReason?: string; createdAt: string; updatedAt: string }
const initialMovements = (): MswMovement[] => [{ id: 'mov-api-01', type: 'Transferência definitiva', equipmentId: 'eq-001', origin: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, destination: units[0], requestedBy: 'Ana Souza', status: 'Pendente', createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z' }]
type MswCall = CallQueueItem & { equipmentType?: string }
const initialCriticalCalls = (): MswCall[] => ditelFixture.criticalCalls.map((call) => ({ ...call }))
const unitByCallUnitId = {
  ciop: { id: 'ciop', name: 'CIOp Metropolitano', acronym: 'CIOp' },
  'unit-centro': { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' },
  'unit-norte': { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' },
} as const
const callDetailFixtures: Record<string, Pick<CallDetails, 'protocol' | 'problem' | 'description' | 'requestedBy' | 'equipment' | 'openedAt' | 'attachments'>> = {
  'call-401': { protocol: 'CH-2026-0401', problem: 'network', description: 'Descrição persistida da API para o CIOp.', requestedBy: 'Equipe do CIOp', equipment: { id: 'eq-ciop-link', patrimony: 'CIOP-LINK-01', type: 'Switch', model: 'Core 9000', brand: 'Cisco' }, openedAt: '2026-08-30T08:00:00.000Z', attachments: [] },
  'call-402': { protocol: 'CH-2026-0402', problem: 'radio', description: 'Descrição persistida da API para o rádio operacional.', requestedBy: 'Ana Souza', equipment: { id: 'eq-001', patrimony: 'PAT-2026-004821', type: 'Rádio portátil', model: 'APX 2000', brand: 'Motorola' }, openedAt: '2026-08-30T08:01:00.000Z', attachments: [{ id: 'att-call-402', name: 'evidencia.pdf', type: 'application/pdf', size: 512, uploadedAt: '2026-08-30T08:02:00.000Z', status: 'active', downloadUrl: '/api/v1/attachments/att-call-402/download' }] },
  'call-403': { protocol: 'CH-2026-0403', problem: 'printer', description: 'Descrição persistida da API para a impressora da recepção.', requestedBy: 'Bruno Santos', equipment: null, openedAt: '2026-08-30T08:02:00.000Z', attachments: [] },
  'call-404': { protocol: 'CH-2026-0404', problem: 'network', description: 'Descrição persistida da API para o enlace de dados.', requestedBy: 'Ana Souza', equipment: { id: 'eq-009', patrimony: 'PAT-2026-004829', type: 'Switch', model: 'SG1024D', brand: 'TP-Link' }, openedAt: '2026-08-30T08:03:00.000Z', attachments: [] },
  'call-405': { protocol: 'CH-2026-0405', problem: 'printer', description: 'Descrição persistida da API para a impressora do arquivo.', requestedBy: 'Ana Souza', equipment: { id: 'eq-008', patrimony: 'PAT-2026-004828', type: 'Impressora', model: 'LaserJet M404', brand: 'HP' }, openedAt: '2026-08-01T11:00:00.000Z', attachments: [] },
}
const initialCallHistories = (): Record<string, CallHistoryEntry[]> => Object.fromEntries(ditelFixture.criticalCalls.map((call) => [call.id, [{ id: `call-opened-${call.id}`, description: 'Chamado aberto pela Unidade.', occurredAt: call.updatedAt }]]))

const initialAdminUsers = (): AdminUserApi[] => [
  { id: 'admin-1', name: 'Ana Souza', registration: '123.456-7', role: 'unit_user', situation: 'active', unit: { id: 'unit-centro', name: 'Unidade Centro', acronym: 'CTR' }, createdAt: '2026-08-30T09:00:00.000Z', updatedAt: '2026-08-30T09:42:00.000Z' },
  { id: 'admin-2', name: 'Carlos Lima', registration: '234.567-8', role: 'ditel_admin', situation: 'active', unit: null, createdAt: '2026-08-29T16:00:00.000Z', updatedAt: '2026-08-29T16:18:00.000Z' },
  { id: 'admin-3', name: 'Bruno Lima', registration: '345.678-9', role: 'unit_user', situation: 'blocked', unit: { id: 'unit-norte', name: 'Unidade Norte', acronym: 'UN' }, createdAt: '2026-08-28T11:00:00.000Z', updatedAt: '2026-08-28T11:18:00.000Z' },
  { id: 'admin-4', name: 'Diana Alves', registration: '456.789-0', role: 'unit_user', situation: 'inactive', unit: { id: 'unit-sul', name: 'Unidade Sul', acronym: 'US' }, createdAt: '2026-08-27T08:00:00.000Z', updatedAt: '2026-08-27T08:18:00.000Z' },
]

let movements = initialMovements()
let adminUsers = initialAdminUsers()
let criticalCalls = initialCriticalCalls()
let maintenanceItems = initialMaintenance()
let equipmentTypes = initialEquipmentTypes()
let missions = initialMissions()
let auditEvents = initialAuditEvents()
let callHistories = initialCallHistories()

const adminSituationByFilter = { Ativo: 'active', Bloqueado: 'blocked', Inativo: 'inactive' } as const

const loginFixtures = [
  {
    registration: '100001',
    password: 'sigat-unit',
    context: {
      userId: 'unit-001',
      name: 'Ana Souza',
      registration: '100001',
      role: 'unit_user' as const,
      unit: { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' },
    },
  },
  {
    registration: '200001',
    password: 'sigat-ditel',
    context: {
      userId: 'ditel-001',
      name: 'Carlos Lima',
      registration: '200001',
      role: 'ditel_admin' as const,
      unit: null,
    },
  },
  {
    registration: '300001',
    password: 'senha-temporaria',
    context: {
      userId: 'reset-001',
      name: 'Patrícia Reset',
      registration: '300001',
      role: 'ditel_admin' as const,
      unit: null,
      mustChangePassword: true,
    },
  },
] as const

type MockAuthState =
  | { status: 'absent' }
  | { status: 'blocked' }
  | { status: 'authenticated'; context: SessionContext }

let mockAuthState: MockAuthState = { status: 'absent' }

export function resetMockAuth() {
  mockAuthState = { status: 'absent' }
  movements = initialMovements()
  adminUsers = initialAdminUsers()
  criticalCalls = initialCriticalCalls()
  callHistories = initialCallHistories()
}

export function setMockAuthState(status: Exclude<MockAuthState['status'], 'authenticated'>) {
  mockAuthState = { status }
}

function readCookie(headerValue: string | null, cookieName: string) {
  return headerValue?.split(';').map((fragment) => fragment.trim()).find((fragment) => fragment.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? null
}

function sessionCookieFor(context: SessionContext) {
  if (context.mustChangePassword) return 'msw-password-change-session'
  return context.role === 'ditel_admin' ? 'msw-ditel-session' : 'msw-unit-session'
}

function callDetailsFor(call: MswCall): CallDetails {
  const fixture = callDetailFixtures[call.id] ?? { protocol: call.id.toUpperCase(), problem: 'software' as const, description: 'Descrição registrada na API.', requestedBy: 'Não informado', equipment: null, openedAt: call.updatedAt ?? new Date().toISOString(), attachments: [] }
  const unit = unitByCallUnitId[call.unitId as keyof typeof unitByCallUnitId] ?? { id: call.unitId, name: call.unitName, acronym: call.unitName }
  return {
    ...call,
    section: call.section,
    protocol: fixture.protocol,
    problem: fixture.problem,
    description: fixture.description,
    unit,
    requestedBy: fixture.requestedBy,
    equipment: fixture.equipment,
    openedAt: fixture.openedAt,
    attachments: fixture.attachments,
    history: callHistories[call.id] ?? [{ id: `call-opened-${call.id}`, description: 'Chamado aberto pela Unidade.', occurredAt: fixture.openedAt }],
  }
}

function resolveMockAuthState(request: Request): MockAuthState {
  const cookie = readCookie(request.headers.get('cookie'), 'sigat_session')
  if (cookie === 'msw-session' || cookie === 'msw-ditel-session') return { status: 'authenticated', context: loginFixtures[1].context }
  if (cookie === 'msw-unit-session') return { status: 'authenticated', context: loginFixtures[0].context }
  if (cookie === 'msw-password-change-session') return { status: 'authenticated', context: loginFixtures[2].context }
  if (cookie === 'msw-blocked-session') return { status: 'blocked' }

  // Node's fetch does not retain Set-Cookie between requests. The state fallback
  // exists only for MSW's test server; browser requests are resolved by cookie.
  return import.meta.env.MODE === 'test' ? mockAuthState : { status: 'absent' }
}

function invalidLogin() {
  return HttpResponse.json({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas.' }, { status: 401 })
}

function unauthorized() {
  return HttpResponse.json({ code: 'UNAUTHENTICATED', message: 'Sessão autenticada com unidade é obrigatória.' }, { status: 401 })
}

function matchesSearch(item: FixtureEquipment, search: string) {
  const normalizedSearch = search.toLocaleLowerCase()
  return [item.patrimony, item.type, item.model, item.brand, item.location].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
}

function matchesValue(value: string, expected: string | null) {
  return !expected || value.toLocaleLowerCase() === expected.toLocaleLowerCase()
}

function emptyReportCounters() {
  return { total: 0, active: 0, maintenance: 0, inactive: 0, lost: 0, writtenOff: 0, attention: 0 }
}

function incrementReportCounters(counters: ReturnType<typeof emptyReportCounters>, situation: EquipmentSituation) {
  counters.total += 1
  if (situation === 'written_off') counters.writtenOff += 1
  else counters[situation] += 1
  if (['inactive', 'lost', 'written_off'].includes(situation)) counters.attention += 1
}

function buildInventoryReportResponse(session: SessionContext, requestUrl: string) {
  const url = new URL(requestUrl)
  const requestedUnitId = session.role === 'ditel_admin' ? url.searchParams.get('unitId') : null
  const situation = url.searchParams.get('situation') as EquipmentSituation | null
  const scopedEquipment = equipment
    .filter((item) => session.role === 'ditel_admin' || item.unitId === session.unit?.id)
    .filter((item) => !requestedUnitId || item.unitId === requestedUnitId)
    .filter((item) => !situation || item.situation === situation)
  const totals = emptyReportCounters()
  const byUnit = new Map<string, ReturnType<typeof emptyReportCounters> & { unit: { id: string; name: string; acronym: string } }>()

  for (const item of scopedEquipment) {
    const unit = item.unitId === 'unit-centro' ? { id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' } : units.find((candidate) => candidate.id === item.unitId) ?? { id: item.unitId, name: item.unitName, acronym: item.unitName }
    const summary = byUnit.get(unit.id) ?? { unit, ...emptyReportCounters() }
    incrementReportCounters(totals, item.situation)
    incrementReportCounters(summary, item.situation)
    byUnit.set(unit.id, summary)
  }

  const scope = session.role === 'ditel_admin'
    ? requestedUnitId
      ? byUnit.get(requestedUnitId)?.unit ?? [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, ...units].find((unit) => unit.id === requestedUnitId) ?? { id: requestedUnitId, name: requestedUnitId, acronym: requestedUnitId }
      : { id: 'statewide', name: 'Estado do Pará', acronym: 'DITEL' }
    : session.unit ?? { id: 'unit', name: 'Unidade autenticada', acronym: 'UN' }

  return {
    report: {
      id: 'inventory-summary',
      title: 'Inventário consolidado',
      generatedAt: '2026-09-10T12:00:00.000Z',
      scope,
      filters: { situation: situation ?? null },
    },
    totals,
    units: [...byUnit.values()].sort((left, right) => left.unit.name.localeCompare(right.unit.name)),
    generatedBy: { name: session.name, role: session.role },
  }
}

function reportToCsv(report: ReturnType<typeof buildInventoryReportResponse>) {
  const rows = report.units.map((item) => [item.unit.name, item.total, item.active, item.maintenance, item.inactive, item.lost, item.writtenOff, item.attention].join(','))
  return ['Unidade,Total,Em operação,Em manutenção,Inativos,Perdidos,Baixados,Atenção', ...rows].join('\r\n')
}

export const handlers = [
  http.post('*/api/v1/auth/login', async ({ request }) => {
    const input = await request.json() as { registration?: unknown; password?: unknown }
    const registration = typeof input.registration === 'string' ? input.registration.trim() : ''
    const password = typeof input.password === 'string' ? input.password : ''

    if (registration === '999998') return invalidLogin()

    const fixture = loginFixtures.find((candidate) => candidate.registration === registration && candidate.password === password)
    if (!fixture) return invalidLogin()

    mockAuthState = { status: 'authenticated', context: fixture.context }

    return HttpResponse.json(fixture.context, {
      headers: {
        'Set-Cookie': `sigat_session=${sessionCookieFor(fixture.context)}; Path=/; HttpOnly; SameSite=Lax`,
      },
    })
  }),
  http.get('*/api/v1/session', ({ request }) => {
    const authState = resolveMockAuthState(request)
    return authState.status === 'authenticated' ? HttpResponse.json(authState.context) : unauthorized()
  }),
  http.post('*/api/v1/auth/password-change', async ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()

    const input = await request.json() as Record<string, unknown>
    if (Object.keys(input).some((key) => key !== 'newPassword') || typeof input.newPassword !== 'string' || input.newPassword.length < 8) {
      return HttpResponse.json({ code: 'INVALID_PASSWORD_CHANGE', message: 'Dados de troca de senha inválidos.' }, { status: 400 })
    }

    if (!session.mustChangePassword) {
      return HttpResponse.json({ code: 'PASSWORD_CHANGE_NOT_REQUIRED', message: 'Troca obrigatória de senha não está pendente.' }, { status: 409 })
    }

    const { mustChangePassword: _mustChangePassword, ...updatedSession } = session
    mockAuthState = { status: 'authenticated', context: updatedSession }
    return HttpResponse.json(updatedSession)
  }),
  http.post('*/api/v1/admin/users', async ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Acesso administrativo obrigatório.' }, { status: 403 })
    const input = await request.json() as { name?: unknown; registration?: unknown; role?: unknown; password?: unknown; unit?: { id?: unknown; name?: unknown; acronym?: unknown } | null }
    if (typeof input.name !== 'string' || !input.name.trim() || typeof input.registration !== 'string' || !input.registration.trim() || typeof input.password !== 'string' || !input.password || (input.role !== 'ditel_admin' && input.role !== 'unit_user')) return HttpResponse.json({ code: 'INVALID_USER', message: 'Dados do usuário inválidos.' }, { status: 400 })
    const registration = input.registration.trim()
    const selectedUnit = input.unit && [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, ...units].find((unit) => unit.id === input.unit?.id)
    if (input.role === 'unit_user' && (!input.unit || !selectedUnit || input.unit.name !== selectedUnit.name || input.unit.acronym !== selectedUnit.acronym)) return HttpResponse.json({ code: 'INVALID_USER', message: 'Unidade inválida.' }, { status: 400 })
    if (input.role === 'ditel_admin' && input.unit) return HttpResponse.json({ code: 'INVALID_USER', message: 'Administrador DITEL não pode ser limitado a uma unidade.' }, { status: 400 })
    if (adminUsers.some((item) => item.registration === registration)) return HttpResponse.json({ code: 'REGISTRATION_CONFLICT', message: 'Matrícula já cadastrada.' }, { status: 409 })
    const now = new Date().toISOString()
    const created: AdminUserApi = { id: `admin-${adminUsers.length + 1}`, name: input.name.trim(), registration, role: input.role, situation: 'active', unit: input.role === 'unit_user' && selectedUnit ? selectedUnit : null, createdAt: now, updatedAt: now }
    adminUsers.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),
  http.post('*/api/v1/auth/logout', () => {
    resetMockAuth()
    clearSession()
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('*/api/v1/admin/users', ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Acesso administrativo obrigatório.' }, { status: 403 })
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim().toLocaleLowerCase() ?? ''
    const role = url.searchParams.get('role')
    const unitId = url.searchParams.get('unitId')
    const situationFilter = url.searchParams.get('situation')
    const situation = situationFilter && situationFilter in adminSituationByFilter
      ? adminSituationByFilter[situationFilter as keyof typeof adminSituationByFilter]
      : situationFilter
    const filtered = adminUsers.filter((item) => (!search || `${item.name} ${item.registration}`.toLocaleLowerCase().includes(search)) && (!role || item.role === role) && (!unitId || item.unit?.id === unitId) && (!situation || item.situation === situation))
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 20)
    const start = (page - 1) * pageSize
    const ordered = [...filtered].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    return HttpResponse.json({ items: ordered.slice(start, start + pageSize), total: ordered.length, page, pageSize })
  }),
  http.patch('*/api/v1/admin/users/:userId', async ({ request, params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Acesso administrativo obrigatório.' }, { status: 403 })
    const user = adminUsers.find((item) => item.id === params.userId)
    if (!user) return HttpResponse.json({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' }, { status: 404 })
    const input = await request.json() as Record<string, unknown>
    const allowed = new Set(['name', 'registration', 'role', 'unit', 'updatedAt'])
    if (Object.keys(input).some((key) => !allowed.has(key))) return HttpResponse.json({ code: 'INVALID_USER', message: 'Dados do usuário inválidos.' }, { status: 400 })
    if (typeof input.name !== 'string' || !input.name.trim() || typeof input.registration !== 'string' || !input.registration.trim() || (input.role !== 'ditel_admin' && input.role !== 'unit_user') || typeof input.updatedAt !== 'string' || Number.isNaN(new Date(input.updatedAt).getTime())) return HttpResponse.json({ code: 'INVALID_USER', message: 'Dados do usuário inválidos.' }, { status: 400 })
    if (new Date(input.updatedAt).getTime() !== new Date(user.updatedAt).getTime()) return HttpResponse.json({ code: 'USER_CONFLICT', message: 'Usuário alterado por outra operação. Recarregue os dados e tente novamente.' }, { status: 409 })
    const registration = input.registration.trim()
    if (adminUsers.some((item) => item.id !== user.id && item.registration === registration)) return HttpResponse.json({ code: 'REGISTRATION_CONFLICT', message: 'Matrícula já cadastrada.' }, { status: 409 })
    if (input.role === 'ditel_admin' && input.unit !== null) return HttpResponse.json({ code: 'INVALID_USER', message: 'Administrador DITEL não pode ser limitado a uma unidade.' }, { status: 400 })
    const candidateUnit = input.unit as { id?: unknown; name?: unknown; acronym?: unknown } | null
    const selectedUnit = candidateUnit && [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, ...units].find((unit) => unit.id === candidateUnit.id)
    if (input.role === 'unit_user' && (!candidateUnit || !selectedUnit || candidateUnit.name !== selectedUnit.name || candidateUnit.acronym !== selectedUnit.acronym)) return HttpResponse.json({ code: 'INVALID_USER', message: 'Unidade inválida.' }, { status: 400 })
    user.name = input.name.trim()
    user.registration = registration
    user.role = input.role
    user.unit = input.role === 'unit_user' && selectedUnit ? selectedUnit : null
    user.updatedAt = new Date().toISOString()
    return HttpResponse.json(user)
  }),
  http.patch('*/api/v1/admin/users/:userId/situation', async ({ request, params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Acesso administrativo obrigatório.' }, { status: 403 })
    const user = adminUsers.find((item) => item.id === params.userId)
    if (!user) return HttpResponse.json({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' }, { status: 404 })
    const input = await request.json() as { situation?: unknown }
    if (input.situation !== 'active' && input.situation !== 'blocked') return HttpResponse.json({ code: 'INVALID_SITUATION', message: 'Situação de destino inválida.' }, { status: 400 })
    if (user.situation === 'inactive' || user.situation === input.situation) return HttpResponse.json({ code: 'INVALID_SITUATION_TRANSITION', message: 'Transição de situação inválida.' }, { status: 409 })
    user.situation = input.situation
    user.updatedAt = new Date().toISOString()
    return HttpResponse.json({ id: user.id, situation: user.situation })
  }),
  http.get('*/api/v1/inventory', ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()

    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 20)
    const search = url.searchParams.get('search')?.trim()
    const type = url.searchParams.get('type')
    const model = url.searchParams.get('model')
    const situation = url.searchParams.get('situation') as EquipmentSituation | null
    const unitId = session.role === 'ditel_admin' ? url.searchParams.get('unitId') : null
    const items = equipment
      .filter((item) => session.role === 'ditel_admin' || item.unitId === session.unit?.id)
      .filter((item) => !unitId || item.unitId === unitId)
      .filter((item) => !search || matchesSearch(item, search))
      .filter((item) => matchesValue(item.type, type))
      .filter((item) => matchesValue(item.model, model))
      .filter((item) => !situation || item.situation === situation)
    const start = (page - 1) * pageSize

    const total = session.role === 'unit_user' && session.unit?.id === 'unit-centro' && !search && !type && !model && !situation ? 428 : items.length
    return HttpResponse.json({ items: items.slice(start, start + pageSize), total, page, pageSize })
  }),
  http.get('*/api/v1/inventory/:equipmentId', ({ params }) => {
    const session = getSession()
    const item = equipment.find((candidate) => candidate.id === params.equipmentId && (session?.role === 'ditel_admin' || candidate.unitId === session?.unit?.id))
    if (!session) return unauthorized()
    if (!item) return HttpResponse.json({ code: 'EQUIPMENT_NOT_FOUND', message: 'Equipamento não encontrado no escopo da Unidade.' }, { status: 404 })
    return HttpResponse.json({ ...item, ...detailsByEquipment[item.id] })
  }),
  http.get('*/api/v1/attachments/:attachmentId/download', ({ params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    const ownedDocument = equipment.some((item) => {
      if (session.role !== 'ditel_admin' && item.unitId !== session.unit?.id) return false
      return detailsByEquipment[item.id]?.documents.some((document) => document.id === params.attachmentId)
    })
    const ownedCallAttachment = criticalCalls.some((call) => {
      if (session.role !== 'ditel_admin' && call.unitId !== session.unit?.id) return false
      return callDetailFixtures[call.id]?.attachments.some((attachment) => attachment.id === params.attachmentId)
    })
    if (!ownedDocument && !ownedCallAttachment) return HttpResponse.json({ code: 'ATTACHMENT_NOT_FOUND', message: 'Anexo não encontrado.' }, { status: 404 })
    return new HttpResponse('conteudo-do-anexo', { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="anexo"' } })
  }),
  http.post('*/api/v1/inventory', async ({ request }) => {
    const session = getSession()
    if (!session?.unit) return unauthorized()
    const body = await request.formData()
    const patrimony = body.get('patrimony')
    const type = body.get('type')
    const model = body.get('model')
    const brand = body.get('brand')
    const situation = body.get('situation')
    const location = body.get('location')
    const category = body.get('category')
    if (typeof patrimony !== 'string' || typeof type !== 'string' || typeof model !== 'string' || typeof brand !== 'string' || typeof situation !== 'string' || typeof location !== 'string' || !patrimony.trim() || !type.trim() || !model.trim() || !brand.trim() || !location.trim()) {
      return HttpResponse.json({ code: 'INVALID_EQUIPMENT', message: 'Preencha os dados obrigatórios do equipamento.' }, { status: 400 })
    }
    const attachments = body.getAll('attachments')
    if (attachments.length > 5) return HttpResponse.json({ code: 'ATTACHMENT_LIMIT_EXCEEDED', message: 'Você pode anexar no máximo 5 arquivos.' }, { status: 400 })
    for (const attachment of attachments) {
      if (!(attachment instanceof File) || !isAllowedAttachmentFile(attachment, EQUIPMENT_ATTACHMENT_RULES)) return HttpResponse.json({ code: 'INVALID_ATTACHMENT_TYPE', message: 'Tipo de anexo não permitido. Use PDF, JPG ou PNG.' }, { status: 400 })
      if (attachment.size > 15 * 1024 * 1024) return HttpResponse.json({ code: 'ATTACHMENT_TOO_LARGE', message: 'Cada anexo deve ter no máximo 15 MiB.' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const created: FixtureEquipment = { id: `eq-${900 + equipment.length}`, patrimony: patrimony.trim(), type: type.trim(), model: model.trim(), brand: brand.trim(), situation: situation as EquipmentSituation, location: location.trim(), unitId: session.unit.id, unitName: session.unit.name }
    const documents = attachments.map((attachment, index) => attachment instanceof File ? { id: `${created.id}-attachment-${index + 1}`, name: attachment.name, type: attachment.type, size: attachment.size, uploadedAt: now, status: 'active' as const, downloadUrl: `/api/v1/attachments/${created.id}-attachment-${index + 1}/download` } : null).filter((document): document is MockDocument => Boolean(document))
    equipment.unshift(created)
    detailsByEquipment[created.id] = { category: typeof category === 'string' && category.trim() ? category.trim() : 'Não classificado', createdAt: now, createdBy: session.name, updatedAt: now, updatedBy: session.name, allocation: { location: location.trim() }, history: [{ id: `equipment-created-${created.id}`, description: 'Cadastro inicial', occurredAt: now }], linkedCalls: [], documents }
    return HttpResponse.json({ ...created, ...detailsByEquipment[created.id] }, { status: 201 })
  }),
  http.get('*/api/v1/reports/inventory-summary', ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    return HttpResponse.json(buildInventoryReportResponse(session, request.url))
  }),
  http.get('*/api/v1/reports/inventory-summary/export', ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    const url = new URL(request.url)
    const format = url.searchParams.get('format')
    const report = buildInventoryReportResponse(session, request.url)
    if (format === 'csv') {
      return new HttpResponse(reportToCsv(report), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="inventory-summary.csv"',
        },
      })
    }
    if (format === 'pdf') {
      return new HttpResponse('%PDF-1.4\n% SIGAT inventory summary\n%%EOF', {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="inventory-summary.pdf"',
        },
      })
    }
    return HttpResponse.json({ code: 'INVALID_EXPORT_FORMAT', message: 'Formato de exportação inválido.' }, { status: 400 })
  }),
  http.get('*/api/v1/dashboard', () => {
    const session = getSession()
    if (!session) return unauthorized()

    if (session.role === 'ditel_admin') {
      const attentionEquipment = equipment.filter((item) => ['inactive', 'lost', 'written_off'].includes(item.situation))
      const response = {
        unit: { id: 'statewide', name: 'Estado do Pará', acronym: 'DITEL' },
        metrics: {
          total: equipment.length,
          active: equipment.filter((item) => item.situation === 'active').length,
          maintenance: equipment.filter((item) => item.situation === 'maintenance').length,
          attention: attentionEquipment.length,
        },
        situations: [
          { situation: 'active', label: 'Em operação', count: equipment.filter((item) => item.situation === 'active').length },
          { situation: 'maintenance', label: 'Em manutenção', count: equipment.filter((item) => item.situation === 'maintenance').length },
          { situation: 'attention', label: 'Requer atenção', count: attentionEquipment.length },
        ],
        unitSummaries: [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, ...units].map((unit) => {
          const scopedEquipment = equipment.filter((item) => item.unitId === unit.id)
          const scopedAttention = scopedEquipment.filter((item) => ['inactive', 'lost', 'written_off'].includes(item.situation)).length
          return {
            unit,
            coverage: scopedEquipment.length ? '100%' : '0%',
            equipment: scopedEquipment.length,
            attention: scopedAttention,
          }
        }),
        recentActivity: [],
      }
      return HttpResponse.json(response)
    }

    const unit = session.unit
    if (!unit) return unauthorized()
    const scopedEquipment = equipment.filter((item) => item.unitId === unit.id)
    const inventoryTotal = unit.id === 'unit-centro' ? 428 : scopedEquipment.length
    const attentionEquipment = scopedEquipment.filter((item) => ['inactive', 'lost', 'written_off'].includes(item.situation))
    const response = {
      unit,
      metrics: {
        total: inventoryTotal,
        active: scopedEquipment.filter((item) => item.situation === 'active').length,
        maintenance: scopedEquipment.filter((item) => item.situation === 'maintenance').length,
        attention: attentionEquipment.length,
      },
      situations: [
        { situation: 'active', label: 'Em operação', count: scopedEquipment.filter((item) => item.situation === 'active').length },
        { situation: 'maintenance', label: 'Em manutenção', count: scopedEquipment.filter((item) => item.situation === 'maintenance').length },
        { situation: 'attention', label: 'Requer atenção', count: attentionEquipment.length },
      ],
      recentActivity: recentActivityByUnit[unit.id as keyof typeof recentActivityByUnit] ?? [],
    }
    return HttpResponse.json(response)
  }),
  http.get('*/api/v1/calls', () => {
    const session = getSession()
    if (!session) return unauthorized()
    const items = criticalCalls.filter((call) => session.role === 'ditel_admin' || call.unitId === session.unit?.id)
    return HttpResponse.json({ items })
  }),
  http.get('*/api/v1/calls/:callId', ({ params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    const call = criticalCalls.find((item) => item.id === params.callId && (session.role === 'ditel_admin' || item.unitId === session.unit?.id))
    if (!call) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Chamado não encontrado.' }, { status: 404 })
    return HttpResponse.json(callDetailsFor(call))
  }),
  http.get('*/api/v1/units', () => {
    const session = getSession()
    if (!session) return unauthorized()
    return HttpResponse.json({ items: session.role === 'ditel_admin' ? [{ id: 'unit-centro', name: '3º BPM', acronym: '3º BPM' }, ...units] : units })
  }),
  http.get('*/api/v1/movements', () => {
    const session = getSession()
    if (!session) return unauthorized()
    return HttpResponse.json({ items: session.role === 'ditel_admin' ? movements : movements.filter((item) => item.origin.id === session.unit?.id) })
  }),
  http.post('*/api/v1/movements', async ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'unit_user' || !session.unit) return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente usuários de unidade podem solicitar transferências.' }, { status: 403 })
    const input = await request.json() as { equipmentId?: string; destination?: { id: string; name: string; acronym: string } }
    const equipmentItem = equipment.find((item) => item.id === input.equipmentId && item.unitId === session.unit?.id && item.situation === 'active')
    if (!equipmentItem || !input.destination || input.destination.id === session.unit.id || !units.some((unit) => unit.id === input.destination?.id)) return HttpResponse.json({ code: 'INVALID_MOVEMENT', message: 'Dados de transferência inválidos.' }, { status: 400 })
    if (movements.some((item) => item.equipmentId === equipmentItem.id && item.status === 'Pendente')) return HttpResponse.json({ code: 'MOVEMENT_CONFLICT', message: 'O equipamento já possui uma solicitação pendente.' }, { status: 409 })
    const now = new Date().toISOString()
    const created = { id: `mov-api-${movements.length + 1}`, type: 'Transferência definitiva' as const, equipmentId: equipmentItem.id, origin: session.unit, destination: input.destination, requestedBy: session.name, status: 'Pendente' as const, createdAt: now, updatedAt: now }
    movements = [created, ...movements]
    return HttpResponse.json(created, { status: 201 })
  }),
  http.patch('*/api/v1/movements/:movementId/decision', async ({ request, params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente administradores DITEL podem decidir.' }, { status: 403 })
    const input = await request.json() as { status?: 'Aprovada' | 'Rejeitada'; updatedAt?: string; reason?: string }
    const index = movements.findIndex((item) => item.id === params.movementId)
    if (index < 0) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Solicitação não encontrada.' }, { status: 404 })
    const current = movements[index]
    if (current.updatedAt !== input.updatedAt) return HttpResponse.json({ code: 'CONFLICT', message: 'Solicitação alterada.' }, { status: 409 })
    if (input.status === 'Rejeitada' && !input.reason?.trim()) return HttpResponse.json({ code: 'INVALID_MOVEMENT', message: 'Justificativa obrigatória.' }, { status: 400 })
    const updated = { ...current, status: input.status ?? current.status, decisionReason: input.reason, updatedAt: new Date().toISOString() }
    movements = movements.map((item, itemIndex) => itemIndex === index ? updated : item)
    return HttpResponse.json(updated)
  }),
  http.patch('*/api/v1/calls/:callId/triage', async ({ request, params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente administradores DITEL podem triar chamados.' }, { status: 403 })
    const input = await request.json() as { status?: string; priority?: string; section?: ResponsibleSection; updatedAt?: string }
    const allowedKeys = ['status', 'priority', 'section', 'updatedAt']
    const validStatuses = ['Em análise', 'Em atendimento', 'Aguardando informação', 'Resolvido', 'Encerrado']
    const priorityLabels = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' } as Record<string, string>
    const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date(Number.NaN)
    if (!Object.keys(input).every((key) => allowedKeys.includes(key)) || !input.status || !validStatuses.includes(input.status) || !input.priority || !priorityLabels[input.priority] || !['Suporte', 'Telecom'].includes(input.section ?? '') || !input.updatedAt || Number.isNaN(updatedAt.getTime())) {
      return HttpResponse.json({ code: 'INVALID_TRIAGE', message: 'Dados de triagem inválidos.' }, { status: 400 })
    }
    const index = criticalCalls.findIndex((item) => item.id === params.callId)
    if (index < 0) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Chamado não encontrado.' }, { status: 404 })
    const call = criticalCalls[index]
    if (new Date(call.updatedAt ?? '').getTime() !== updatedAt.getTime()) {
      return HttpResponse.json({ code: 'USER_CONFLICT', message: 'O chamado foi alterado por outra operação. Recarregue os dados e tente novamente.' }, { status: 409 })
    }
    const now = new Date().toISOString()
    const updated = { ...call, priority: priorityLabels[input.priority], status: input.status, section: input.section, updatedAt: now }
    criticalCalls = criticalCalls.map((item, itemIndex) => itemIndex === index ? updated : item)
    callHistories[call.id] = [...(callHistories[call.id] ?? []), { id: `call-triage-${call.id}-${callHistories[call.id]?.length ?? 0}`, description: `Triagem DITEL registrada: ${call.status} → ${input.status}.`, occurredAt: now }]
    return HttpResponse.json(updated)
  }),
  http.post('*/api/v1/calls', async ({ request }) => {
    const session = getSession()
    if (!session?.unit) return unauthorized()
    const body = await request.formData()
    const problem = body.get('problem')
    const subject = body.get('subject')
    const description = body.get('description')
    const equipmentId = body.get('equipmentId')
    if (typeof problem !== 'string' || typeof subject !== 'string' || typeof description !== 'string' || !subject.trim() || !description.trim()) {
      return HttpResponse.json({ code: 'INVALID_CALL', message: 'Preencha os dados obrigatórios do chamado.' }, { status: 400 })
    }
    if (typeof equipmentId === 'string' && equipmentId && !equipment.some((item) => item.id === equipmentId && item.unitId === session.unit?.id)) {
      return HttpResponse.json({ code: 'EQUIPMENT_NOT_FOUND', message: 'Equipamento não encontrado no escopo da Unidade.' }, { status: 404 })
    }
    const attachments = body.getAll('attachments')
    if (attachments.length > MAX_CALL_ATTACHMENTS) {
      return HttpResponse.json({ code: 'ATTACHMENT_LIMIT_EXCEEDED', message: `Você pode anexar no máximo ${MAX_CALL_ATTACHMENTS} arquivos.` }, { status: 400 })
    }
    for (const attachment of attachments) {
      if (!(attachment instanceof File) || !isAllowedAttachmentFile(attachment, CALL_ATTACHMENT_RULES)) {
        return HttpResponse.json({ code: 'INVALID_ATTACHMENT_TYPE', message: 'Tipo de anexo não permitido. Use documentos PDF/DOC/DOCX ou fotos JPG/PNG/WEBP/GIF.' }, { status: 400 })
      }
      if (attachment.size > MAX_ATTACHMENT_SIZE_BYTES) {
        return HttpResponse.json({ code: 'ATTACHMENT_TOO_LARGE', message: `Cada anexo deve ter no máximo ${MAX_ATTACHMENT_SIZE_LABEL}.` }, { status: 400 })
      }
    }
    return HttpResponse.json({ id: 'call-900', protocol: 'CH-2026-900' }, { status: 201 })
  }),
  http.get('*/api/v1/maintenance', () => {
    const session = getSession()
    if (!session) return unauthorized()
    const items = maintenanceItems.filter((item) => session.role === 'ditel_admin' || item.unit.id === session.unit?.id)
    return HttpResponse.json({ items })
  }),
  http.post('*/api/v1/maintenance', async ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (!session.unit) return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente usuários de unidade podem abrir manutenções.' }, { status: 403 })
    const input = await request.json() as { equipmentId?: string; description?: string; status?: string; type?: string }
    if (!input.equipmentId || !input.description?.trim() || input.description.trim().length < 10) {
      return HttpResponse.json({ code: 'INVALID_MAINTENANCE', message: 'Descrição deve ter pelo menos 10 caracteres.' }, { status: 400 })
    }
    const equipmentItem = equipment.find((item) => item.id === input.equipmentId && item.unitId === session.unit?.id)
    if (!equipmentItem) return HttpResponse.json({ code: 'EQUIPMENT_NOT_FOUND', message: 'Equipamento não encontrado no escopo da Unidade.' }, { status: 404 })
    const now = new Date().toISOString()
    const created: MswMaintenance = {
      id: `mnt-api-${maintenanceItems.length + 1}`,
      equipment: { id: equipmentItem.id, patrimony: equipmentItem.patrimony, type: equipmentItem.type, model: equipmentItem.model, brand: equipmentItem.brand },
      unit: session.unit,
      status: 'open',
      type: input.type === 'preventive' ? 'preventive' : 'corrective',
      description: input.description.trim(),
      openedAt: now,
      updatedAt: now,
    }
    maintenanceItems = [created, ...maintenanceItems]
    return HttpResponse.json(created, { status: 201 })
  }),
  http.patch('*/api/v1/maintenance/:maintenanceId', async ({ request, params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente administradores DITEL podem atualizar manutenções.' }, { status: 403 })
    const index = maintenanceItems.findIndex((item) => item.id === params.maintenanceId)
    if (index < 0) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Manutenção não encontrada.' }, { status: 404 })
    const input = await request.json() as { status?: 'open' | 'in_progress' | 'completed' | 'cancelled'; updatedAt?: string; diagnosis?: string; service?: string; technicalResponsible?: string; observations?: string }
    const current = maintenanceItems[index]
    if (current.updatedAt !== input.updatedAt) {
      return HttpResponse.json({ code: 'MAINTENANCE_CONFLICT', message: 'A manutenção foi alterada por outra operação. Recarregue os dados atuais e tente novamente.' }, { status: 409 })
    }
    if (input.status === 'cancelled' && !input.observations?.trim()) {
      return HttpResponse.json({ code: 'INVALID_MAINTENANCE', message: 'Justificativa obrigatória para cancelamento.' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const updated: MswMaintenance = {
      ...current,
      status: input.status ?? current.status,
      ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}),
      ...(input.service !== undefined ? { service: input.service } : {}),
      ...(input.technicalResponsible !== undefined ? { technicalResponsible: input.technicalResponsible } : {}),
      ...(input.observations !== undefined ? { observations: input.observations } : {}),
      ...(input.status === 'completed' ? { completedAt: now } : {}),
      updatedAt: now,
    }
    maintenanceItems = maintenanceItems.map((item, itemIndex) => itemIndex === index ? updated : item)
    return HttpResponse.json(updated)
  }),
  http.get('*/api/v1/equipment-types', ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    const url = new URL(request.url)
    const includeInactive = url.searchParams.get('includeInactive') === 'true'
    const items = equipmentTypes.filter((item) => includeInactive || item.active)
    return HttpResponse.json({ items })
  }),
  http.post('*/api/v1/equipment-types', async ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente administradores DITEL podem gerenciar tipos de equipamento.' }, { status: 403 })
    const input = await request.json() as { name?: string; description?: string }
    if (!input.name?.trim()) return HttpResponse.json({ code: 'INVALID_EQUIPMENT_TYPE', message: 'Nome é obrigatório.' }, { status: 400 })
    if (equipmentTypes.some((item) => item.name.toLowerCase() === input.name!.trim().toLowerCase())) {
      return HttpResponse.json({ code: 'DUPLICATE_EQUIPMENT_TYPE', message: 'Já existe um tipo com esse nome.' }, { status: 409 })
    }
    const now = new Date().toISOString()
    const created = { id: `et-api-${equipmentTypes.length + 1}`, name: input.name.trim(), description: input.description?.trim() ?? '', active: true, createdAt: now, updatedAt: now }
    equipmentTypes = [created, ...equipmentTypes]
    return HttpResponse.json(created, { status: 201 })
  }),
  http.patch('*/api/v1/equipment-types/:equipmentTypeId', async ({ request, params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente administradores DITEL podem gerenciar tipos de equipamento.' }, { status: 403 })
    const index = equipmentTypes.findIndex((item) => item.id === params.equipmentTypeId)
    if (index < 0) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Tipo não encontrado.' }, { status: 404 })
    const input = await request.json() as { name?: string; description?: string; active?: boolean }
    const current = equipmentTypes[index]
    if (input.name !== undefined && equipmentTypes.some((item) => item.id !== current.id && item.name.toLowerCase() === input.name!.trim().toLowerCase())) {
      return HttpResponse.json({ code: 'DUPLICATE_EQUIPMENT_TYPE', message: 'Já existe um tipo com esse nome.' }, { status: 409 })
    }
    const updated = { ...current, name: input.name?.trim() ?? current.name, description: input.description?.trim() ?? current.description, active: input.active ?? current.active, updatedAt: new Date().toISOString() }
    equipmentTypes = equipmentTypes.map((item, itemIndex) => itemIndex === index ? updated : item)
    return HttpResponse.json(updated)
  }),
  http.delete('*/api/v1/equipment-types/:equipmentTypeId', ({ params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente administradores DITEL podem gerenciar tipos de equipamento.' }, { status: 403 })
    const index = equipmentTypes.findIndex((item) => item.id === params.equipmentTypeId)
    if (index < 0) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Tipo não encontrado.' }, { status: 404 })
    const updated = { ...equipmentTypes[index], active: false, updatedAt: new Date().toISOString() }
    equipmentTypes = equipmentTypes.map((item, itemIndex) => itemIndex === index ? updated : item)
    return HttpResponse.json(updated)
  }),
  http.get('*/api/v1/missions', ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    const url = new URL(request.url)
    const unitId = url.searchParams.get('unitId')
    const status = url.searchParams.get('status')
    let items = missions
    if (unitId && session.role === 'unit_user' && unitId !== session.unit?.id) {
      return HttpResponse.json({ code: 'FORBIDDEN', message: 'Unidade sem acesso a esta missão.' }, { status: 403 })
    }
    if (session.role === 'unit_user') items = items.filter((item) => item.unit.id === session.unit?.id)
    if (unitId) items = items.filter((item) => item.unit.id === unitId)
    if (status) items = items.filter((item) => item.status === status)
    return HttpResponse.json({ items })
  }),
  http.post('*/api/v1/missions', async ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente administradores DITEL podem criar missões.' }, { status: 403 })
    const input = await request.json() as { title?: string; description?: string; type?: string; priority?: string; unit?: { id: string; name: string } }
    if (!input.title?.trim() || !input.description?.trim()) {
      return HttpResponse.json({ code: 'INVALID_MISSION', message: 'Título e descrição são obrigatórios.' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const created = {
      id: `mis-api-${missions.length + 1}`,
      title: input.title.trim(),
      description: input.description.trim(),
      type: input.type ?? 'maintenance',
      status: 'assigned',
      priority: input.priority ?? 'medium',
      unit: input.unit ?? { id: 'unit-centro', name: '3º BPM' },
      equipment: [],
      assignedBy: { id: session.userId, name: session.name, registration: session.registration },
      assignedTo: { id: input.unit?.id ?? 'unit-centro', name: input.unit?.name ?? '3º BPM', registration: '100001' },
      startedAt: null,
      completedAt: null,
      notes: [],
      createdAt: now,
      updatedAt: now,
    }
    missions = [created, ...missions]
    return HttpResponse.json(created, { status: 201 })
  }),
  http.patch('*/api/v1/missions/:missionId', async ({ request, params }) => {
    const session = getSession()
    if (!session) return unauthorized()
    const index = missions.findIndex((item) => item.id === params.missionId)
    if (index < 0) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Missão não encontrada.' }, { status: 404 })
    const current = missions[index]
    if (session.role === 'unit_user' && current.unit.id !== session.unit?.id) {
      return HttpResponse.json({ code: 'FORBIDDEN', message: 'Unidade sem acesso a esta missão.' }, { status: 403 })
    }
    const input = await request.json() as { status?: string; note?: string }
    const allowed = { assigned: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] } as Record<string, string[]>
    if (!input.status || !allowed[current.status]?.includes(input.status)) {
      return HttpResponse.json({ code: 'MISSION_TRANSITION', message: 'Transição de status não permitida.' }, { status: 409 })
    }
    if ((input.status === 'in_progress' || input.status === 'completed') && session.role !== 'unit_user') {
      return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente a unidade pode iniciar ou concluir a missão.' }, { status: 403 })
    }
    if (input.status === 'cancelled' && session.role !== 'ditel_admin') {
      return HttpResponse.json({ code: 'FORBIDDEN', message: 'Somente a DITEL pode cancelar uma missão.' }, { status: 403 })
    }
    const now = new Date().toISOString()
    const updated = {
      ...current,
      status: input.status,
      ...(input.status === 'in_progress' ? { startedAt: now } : {}),
      ...(input.status === 'completed' ? { completedAt: now } : {}),
      ...(input.note?.trim() ? { notes: [...current.notes, { author: session.name, text: input.note.trim(), createdAt: now }] } : {}),
      updatedAt: now,
    }
    missions = missions.map((item, itemIndex) => itemIndex === index ? updated : item)
    return HttpResponse.json(updated)
  }),
  http.get('*/api/v1/audit-events', ({ request }) => {
    const session = getSession()
    if (!session) return unauthorized()
    if (session.role !== 'ditel_admin') return HttpResponse.json({ code: 'FORBIDDEN', message: 'Acesso administrativo obrigatório.' }, { status: 403 })
    const url = new URL(request.url)
    const module = url.searchParams.get('module')
    const result = url.searchParams.get('result')
    const action = url.searchParams.get('action')
    let items = auditEvents
    if (module) items = items.filter((event) => event.module === module)
    if (result) items = items.filter((event) => event.result === result)
    if (action) items = items.filter((event) => event.action === action)
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20)))
    const start = (page - 1) * pageSize
    const paginated = items.slice(start, start + pageSize)
    return HttpResponse.json({ items: paginated, total: items.length, page, pageSize })
  }),
]
