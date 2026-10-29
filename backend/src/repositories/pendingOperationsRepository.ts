import { AcReturnModel, AC_RETURN_ACTIVE_STATUSES } from '../models/AcReturn.js';
import { CallModel, TRIAGE_STATUSES } from '../models/Call.js';
import { MaintenanceModel } from '../models/Maintenance.js';
import { MissionModel } from '../models/Mission.js';
import { MovementModel, MOVEMENT_ACTIVE_STATUSES } from '../models/Movement.js';

export const PENDING_SOURCES = ['movement', 'ac_return', 'call', 'maintenance', 'mission'] as const;
export type PendingSource = typeof PENDING_SOURCES[number];
export type PendingRole = 'ditel_admin' | 'ac_operator' | 'unit_user';

export interface PendingQuery {
  page: number;
  pageSize: number;
  source?: PendingSource;
  state?: string;
  priority?: string;
  unitId?: string;
  search?: string;
}

export interface PendingScope {
  role: PendingRole;
  unitId: string | null;
}

export interface PendingOperation {
  id: string;
  source: PendingSource;
  type: string;
  state: string;
  description: string;
  action: string;
  priority: string | null;
  date: string;
  unitId: string | null;
  reference: { path: string; label: string };
}

export interface PendingOperationsPage {
  items: PendingOperation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: Array<{ source: PendingSource; total: number }>;
}

const SOURCE_ORDER: PendingSource[] = ['movement', 'ac_return', 'call', 'maintenance', 'mission'];
const MAX_PAGE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_SCAN = 5_000;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sourceAllowed(source: PendingSource, scope: PendingScope) {
  if (scope.role === 'ditel_admin') return true;
  if (scope.role === 'ac_operator') return source === 'ac_return';
  return true;
}

function scopedUnitFilter(scope: PendingScope, unitId?: string) {
  if (scope.role === 'unit_user') {
    if (unitId && unitId !== scope.unitId) return '__no_unit_scope__';
    return scope.unitId ?? '__no_unit_scope__';
  }
  return unitId;
}

function matchesSearch(search: string | undefined, fields: string[]) {
  if (!search) return undefined;
  const expression = new RegExp(escapeRegex(search), 'i');
  return { $or: fields.map((field) => ({ [field]: expression })) };
}

function sourceFilter(query: PendingQuery, scope: PendingScope, source: PendingSource): Record<string, unknown> {
  const unitId = scopedUnitFilter(scope, query.unitId);
  const filter: Record<string, unknown> = {};

  if (source === 'movement') {
    filter.status = { $in: MOVEMENT_ACTIVE_STATUSES };
    if (unitId) filter.$or = [{ 'origin.id': unitId }, { 'destination.id': unitId }];
    const search = matchesSearch(query.search, ['equipmentId', 'origin.name', 'origin.acronym', 'destination.name', 'destination.acronym']);
    if (search) filter.$and = [search];
  }
  if (source === 'ac_return') {
    filter.status = { $in: AC_RETURN_ACTIVE_STATUSES };
    if (unitId) filter['origin.id'] = unitId;
    const search = matchesSearch(query.search, ['equipmentId', 'origin.name', 'origin.acronym', 'equipment.patrimony', 'equipment.serialNumber']);
    if (search) filter.$and = [search];
  }
  if (source === 'call') {
    filter.status = { $nin: ['Resolvido', 'Encerrado'] };
    if (unitId) filter['unit.id'] = unitId;
    const search = matchesSearch(query.search, ['protocol', 'subject', 'description', 'unit.name', 'unit.acronym']);
    if (search) filter.$and = [search];
  }
  if (source === 'maintenance') {
    filter.status = { $in: ['open', 'in_progress'] };
    if (unitId) filter['unit.id'] = unitId;
    const search = matchesSearch(query.search, ['equipment.patrimony', 'equipmentId', 'description', 'type', 'unit.name', 'unit.acronym']);
    if (search) filter.$and = [search];
  }
  if (source === 'mission') {
    filter.status = { $in: ['assigned', 'in_progress'] };
    if (unitId) filter['unit.id'] = unitId;
    const search = matchesSearch(query.search, ['title', 'description', 'unit.name', 'unit.acronym']);
    if (search) filter.$and = [search];
  }

  return filter;
}

function stateFilter(query: PendingQuery, source: PendingSource, filter: Record<string, unknown>) {
  if (!query.state) return;
  const allowed = source === 'movement' ? MOVEMENT_ACTIVE_STATUSES
    : source === 'ac_return' ? AC_RETURN_ACTIVE_STATUSES
      : source === 'call' ? (['Aberto', ...TRIAGE_STATUSES.filter((status) => status !== 'Resolvido' && status !== 'Encerrado')] as string[])
        : source === 'maintenance' ? ['open', 'in_progress']
          : ['assigned', 'in_progress'];
  filter.status = (allowed as readonly string[]).includes(query.state) ? query.state : '__no_pending_state__';
  if (query.priority) filter.priority = query.priority;
}

function dateOf(document: { updatedAt?: Date; createdAt?: Date; openedAt?: Date }) {
  return new Date(document.updatedAt ?? document.openedAt ?? document.createdAt ?? 0);
}

function actionFor(source: PendingSource, state: string) {
  if (state === 'Divergência') return 'Resolver divergência';
  if (source === 'movement' && state === 'Pendente') return 'Autorizar transferência';
  if ((source === 'movement' || source === 'ac_return') && state === 'Aguardando recebimento') return 'Confirmar recebimento';
  if (source === 'ac_return' && state === 'Pendente') return 'Autorizar devolução ao AC';
  if (source === 'call' && state === 'Aberto') return 'Iniciar atendimento';
  if (source === 'call') return 'Atualizar atendimento';
  if (source === 'maintenance' && state === 'open') return 'Iniciar manutenção';
  if (source === 'maintenance') return 'Atualizar manutenção';
  if (source === 'mission' && state === 'assigned') return 'Iniciar missão';
  return 'Atualizar missão';
}

function common(query: PendingQuery, source: PendingSource, document: any): PendingOperation {
  const id = String(document._id);
  const state = String(document.status);
  const date = dateOf(document).toISOString();
  const unitId = document.unit?.id ?? document.origin?.id ?? document.destination?.id ?? null;
  const label = source === 'movement' ? 'Movimentações' : source === 'ac_return' ? 'Devoluções AC' : source === 'call' ? 'Chamados' : source === 'maintenance' ? 'Manutenção' : 'Missões técnicas';
  const path = source === 'movement' ? `/movimentacoes?movementId=${encodeURIComponent(id)}` : source === 'ac_return' ? `/ac/transferencias?returnId=${encodeURIComponent(id)}` : source === 'call' ? `/chamados?callId=${encodeURIComponent(id)}` : source === 'maintenance' ? `/manutencao?maintenanceId=${encodeURIComponent(id)}` : `/missoes-tecnicas?missionId=${encodeURIComponent(id)}`;
  const description = source === 'movement'
    ? `Transferência ${document.origin?.acronym ?? document.origin?.name ?? ''} → ${document.destination?.acronym ?? document.destination?.name ?? ''}`
    : source === 'ac_return'
      ? `Devolução do equipamento ${document.equipment?.patrimony ?? document.equipmentId}`
      : source === 'call'
        ? `${document.protocol}: ${document.subject}`
        : source === 'maintenance'
          ? `${document.equipment?.patrimony ?? document.equipmentId}: ${document.description}`
          : document.title;
  return { id, source, type: label, state, description, action: actionFor(source, state), priority: document.priority ?? null, date, unitId, reference: { path, label } };
}

type SourceResult = { source: PendingSource; total: number; items: PendingOperation[] };

async function readSource(source: PendingSource, query: PendingQuery, scope: PendingScope, skip: number, limit: number): Promise<SourceResult> {
  if (!sourceAllowed(source, scope)) return { source, total: 0, items: [] };
  if (query.source && query.source !== source) return { source, total: 0, items: [] };
  const filter = sourceFilter(query, scope, source);
  stateFilter(query, source, filter);
  const model: any = source === 'movement' ? MovementModel : source === 'ac_return' ? AcReturnModel : source === 'call' ? CallModel : source === 'maintenance' ? MaintenanceModel : MissionModel;
  const dateField = source === 'maintenance' ? 'openedAt' : 'updatedAt';
  const [total, documents] = await Promise.all([
    model.countDocuments(filter).exec(),
    model.find(filter).sort({ [dateField]: -1, _id: 1 }).skip(skip).limit(limit).lean().exec() as Promise<any[]>,
  ]);
  return { source, total, items: documents.map((document) => common(query, source, document)) };
}

export async function listPendingOperations(query: PendingQuery, scope: PendingScope): Promise<PendingOperationsPage> {
  const offset = (query.page - 1) * query.pageSize;
  const scan = offset + query.pageSize;
  if (query.page < 1 || query.page > MAX_PAGE || query.pageSize < 1 || query.pageSize > MAX_PAGE_SIZE || scan > MAX_SCAN) {
    throw new Error('PAGINATION_TOO_DEEP');
  }
  const results = await Promise.all(SOURCE_ORDER.map((source) => readSource(source, query, scope, 0, scan)));
  const total = results.reduce((sum, result) => sum + result.total, 0);
  const items = results.flatMap((result) => result.items)
    .sort((a, b) => b.date.localeCompare(a.date) || SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) || a.id.localeCompare(b.id))
    .slice(offset, offset + query.pageSize);
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    counts: results.filter((result) => result.total > 0).map((result) => ({ source: result.source, total: result.total })),
  };
}

export { MAX_PAGE, MAX_PAGE_SIZE };
