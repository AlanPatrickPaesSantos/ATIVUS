import mongoose from 'mongoose';

import { listAuditEvents, type RecordedAuditEvent } from './auditRepository.js';
import { resolveAccessScopeFromContext, type ActiveUnitAccessScope } from '../auth/activeUnitScope.js';
import { AcReturnModel, AC_RETURN_ACTIVE_STATUSES, type AcReturnStatus } from '../models/AcReturn.js';
import { AcTransferModel } from '../models/AcTransfer.js';
import { CallModel } from '../models/Call.js';
import { EquipmentModel } from '../models/Equipment.js';
import { MovementModel, MOVEMENT_ACTIVE_STATUSES, type MovementStatus } from '../models/Movement.js';
import type { SessionContext } from '../auth/sessionService.js';
import type { UnitReference } from '../models/User.js';
import { publicAttachment } from '../services/attachments.js';

export type PatrimonialOperationKind = 'unit_transfer' | 'ac_return';

export interface PatrimonialOperationView {
  id: string;
  kind: PatrimonialOperationKind;
  equipmentId: string;
  status: MovementStatus | AcReturnStatus;
  requestedAt: string;
  updatedAt: string;
  origin: UnitReference;
  destination: UnitReference | { scope: 'AC'; unit: null };
  reason: string | null;
  divergenceCount: number;
}

export interface PatrimonialHistoryItem {
  id: string;
  source: 'equipment' | 'movement' | 'ac_return';
  description: string;
  occurredAt: string;
  status?: MovementStatus | AcReturnStatus;
  operationId?: string;
  snapshot?: Record<string, unknown> | null;
}

export interface PatrimonialPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PatrimonialReadView {
  equipment: {
    id: string;
    patrimony: string;
    serialNumber?: string;
    type: string;
    brand: string;
    model: string;
    category: string;
    situation: string;
    location: string;
    unit: UnitReference | null;
    custody: { scope: 'AC' | 'UNIT'; unit: UnitReference | null } | null;
    createdAt: string;
    updatedAt: string;
  };
  activeOperation: PatrimonialOperationView | null;
  history: PatrimonialPage<PatrimonialHistoryItem>;
  relatedCalls: Array<{ id: string; protocol: string; subject: string; status: string; openedAt: string }>;
  documents: Array<Record<string, unknown>>;
  auditEvents: PatrimonialPage<RecordedAuditEvent>;
}

const MAX_RELATED_RECORDS = 500;

function pageValue(value: number | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error('INVALID_PAGINATION');
  return value;
}

function operationFromMovement(document: any): PatrimonialOperationView {
  return {
    id: String(document._id), kind: 'unit_transfer', equipmentId: document.equipmentId, status: document.status,
    requestedAt: new Date(document.createdAt).toISOString(), updatedAt: new Date(document.updatedAt).toISOString(),
    origin: document.origin, destination: document.destination, reason: document.decisionReason ?? null,
    divergenceCount: document.divergences?.length ?? 0,
  };
}

function operationFromReturn(document: any): PatrimonialOperationView {
  return {
    id: String(document._id), kind: 'ac_return', equipmentId: document.equipmentId, status: document.status,
    requestedAt: new Date(document.createdAt).toISOString(), updatedAt: new Date(document.updatedAt).toISOString(),
    origin: document.origin, destination: { scope: 'AC', unit: null }, reason: document.requestReason ?? document.decisionReason ?? null,
    divergenceCount: document.divergences?.length ?? 0,
  };
}

function equipmentHistory(document: any): PatrimonialHistoryItem[] {
  return (document.history ?? []).map((entry: any) => ({
    id: entry.id, source: 'equipment', description: entry.description, occurredAt: new Date(entry.occurredAt).toISOString(),
  }));
}

function movementHistory(document: any): PatrimonialHistoryItem[] {
  return [{
    id: `movement-${String(document._id)}`, source: 'movement',
    description: `${document.origin.name} → ${document.destination.name}`,
    occurredAt: new Date(document.createdAt).toISOString(), status: document.status, operationId: String(document._id), snapshot: null,
  }];
}

function returnHistory(document: any): PatrimonialHistoryItem[] {
  const items: PatrimonialHistoryItem[] = [{
    id: `ac-return-${String(document._id)}-request`, source: 'ac_return', description: 'Devolução Unidade → AC solicitada',
    occurredAt: new Date(document.createdAt).toISOString(), status: 'Pendente', operationId: String(document._id), snapshot: document.equipment ?? null,
  }];
  if (document.decidedAt) items.push({ id: `ac-return-${String(document._id)}-decision`, source: 'ac_return', description: 'Decisão da devolução registrada', occurredAt: new Date(document.decidedAt).toISOString(), status: document.status, operationId: String(document._id), snapshot: document.equipment ?? null });
  for (const [index, divergence] of (document.divergences ?? []).entries()) {
    items.push({ id: `ac-return-${String(document._id)}-divergence-${index}`, source: 'ac_return', description: divergence.description, occurredAt: new Date(divergence.reportedAt).toISOString(), status: 'Divergência', operationId: String(document._id), snapshot: document.equipment ?? null });
  }
  return items;
}

function hasAccess(document: any, context: SessionContext, access: ActiveUnitAccessScope | null) {
  if (context.role === 'ditel_admin') return true;
  if (context.role === 'ac_operator') return document.custody?.scope === 'AC';
  return Boolean(access?.role === 'unit_user' && document.unit?.id === access.unitId && document.custody?.scope !== 'AC');
}

export async function readPatrimonialView(
  equipmentId: string,
  context: SessionContext,
  options: { historyPage?: number; historyPageSize?: number; auditPage?: number; auditPageSize?: number } = {},
): Promise<PatrimonialReadView | null> {
  if (!mongoose.isValidObjectId(equipmentId)) return null;
  const historyPage = pageValue(options.historyPage, 1, Number.MAX_SAFE_INTEGER);
  const historyPageSize = pageValue(options.historyPageSize, 20, 100);
  const auditPage = pageValue(options.auditPage, 1, Number.MAX_SAFE_INTEGER);
  const auditPageSize = pageValue(options.auditPageSize, 20, 100);
  const [document, access] = await Promise.all([
    EquipmentModel.findById(equipmentId).lean().exec(),
    context.role === 'unit_user' ? resolveAccessScopeFromContext(context) : Promise.resolve(null),
  ]);
  if (!document || !hasAccess(document, context, access)) return null;
  const callsFilter = context.role === 'ditel_admin'
    ? { equipmentId }
    : { equipmentId, 'unit.id': document.unit?.id ?? '__no_unit__' };

  const [movements, returns, activeMovements, activeReturns, calls, transfers, audits] = await Promise.all([
    MovementModel.find({ equipmentId }).sort({ createdAt: -1, _id: -1 }).limit(MAX_RELATED_RECORDS).lean().exec(),
    AcReturnModel.find({ equipmentId }).sort({ createdAt: -1, _id: -1 }).limit(MAX_RELATED_RECORDS).lean().exec(),
    MovementModel.find({ equipmentId, status: { $in: [...MOVEMENT_ACTIVE_STATUSES] } }).sort({ updatedAt: -1, _id: -1 }).limit(2).lean().exec(),
    AcReturnModel.find({ equipmentId, status: { $in: [...AC_RETURN_ACTIVE_STATUSES] } }).sort({ updatedAt: -1, _id: -1 }).limit(2).lean().exec(),
    CallModel.find(callsFilter).select({ protocol: 1, subject: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1, _id: -1 }).limit(MAX_RELATED_RECORDS).lean().exec(),
    AcTransferModel.find({ 'materials.equipmentId': equipmentId }).select({ _id: 1, distributedAt: 1 }).sort({ distributedAt: -1, _id: -1 }).limit(MAX_RELATED_RECORDS).lean().exec(),
    context.role === 'ditel_admin'
      ? listAuditEvents({ entityType: 'equipment', entityId: equipmentId }, auditPage, auditPageSize)
      : Promise.resolve({ items: [], total: 0, page: auditPage, pageSize: auditPageSize }),
  ]);

  const active = [...activeMovements.map(operationFromMovement), ...activeReturns.map(operationFromReturn)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  const historyItems = [
    ...equipmentHistory(document),
    ...movements.flatMap(movementHistory),
    ...returns.flatMap(returnHistory),
    ...transfers.map((transfer: any) => ({ id: `ac-transfer-${String(transfer._id)}`, source: 'movement' as const, description: 'Distribuição AC para unidade', occurredAt: new Date(transfer.distributedAt).toISOString(), status: 'Recebida' as const, operationId: String(transfer._id), snapshot: null })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
  const historyStart = (historyPage - 1) * historyPageSize;

  return {
    equipment: {
      id: String(document._id), patrimony: document.patrimony, ...(document.serialNumber ? { serialNumber: document.serialNumber } : {}),
      type: document.type, brand: document.brand, model: document.model, category: document.category ?? '', situation: document.situation,
      location: document.location, unit: document.unit ?? null, custody: document.custody ?? null,
      createdAt: new Date(document.createdAt).toISOString(), updatedAt: new Date(document.updatedAt).toISOString(),
    },
    activeOperation: active,
    history: { items: historyItems.slice(historyStart, historyStart + historyPageSize), total: historyItems.length, page: historyPage, pageSize: historyPageSize },
    relatedCalls: calls.map((call: any) => ({ id: String(call._id), protocol: call.protocol, subject: call.subject, status: call.status, openedAt: new Date(call.createdAt).toISOString() })),
    documents: [
      ...(document.attachments ?? []).map((attachment: any) => ({ ...publicAttachment(attachment), source: 'equipment' })),
      ...transfers.map((transfer: any) => ({
        id: String(transfer._id), name: `Termo de transferência ${String(transfer._id)}`, type: 'generated', source: 'ac_transfer',
        downloadUrl: `/api/v1/ac/transfers/${String(transfer._id)}/document`, availableFormats: ['pdf', 'docx'],
      })),
    ],
    auditEvents: audits,
  };
}
