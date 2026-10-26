import { AcTransferModel } from '../models/AcTransfer.js';
import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';

export interface AcPatrimonialReportFilters {
  from?: string;
  to?: string;
  unitId?: string;
  patrimony?: string;
  type?: string;
  model?: string;
  situation?: EquipmentSituation;
  bg?: string;
}

export interface AcPatrimonialReportPage {
  page: number;
  pageSize: number;
  sort: 'distributedAt' | 'patrimony' | 'destinationUnit';
  order: 'asc' | 'desc';
}

const AC_STOCK_FILTER = { 'custody.scope': 'AC', 'custody.unit': null, unit: null };

function dateRange(filters: AcPatrimonialReportFilters) {
  const range: Record<string, Date> = {};
  if (filters.from) range.$gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) range.$lte = new Date(`${filters.to}T23:59:59.999Z`);
  return Object.keys(range).length ? range : undefined;
}

function textExpression(value?: string) {
  if (!value) return undefined;
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function equipmentFilter(filters: AcPatrimonialReportFilters, ids?: string[]) {
  const filter: Record<string, unknown> = { ...AC_STOCK_FILTER };
  if (ids) filter._id = { $in: ids };
  return applyEquipmentAttributes(filter, filters);
}

function applyEquipmentAttributes(filter: Record<string, unknown>, filters: AcPatrimonialReportFilters) {
  if (filters.patrimony) filter.patrimony = textExpression(filters.patrimony);
  if (filters.type) filter.type = textExpression(filters.type);
  if (filters.model) filter.model = textExpression(filters.model);
  if (filters.situation) filter.situation = filters.situation;
  return filter;
}

async function matchingEquipmentIds(filters: AcPatrimonialReportFilters) {
  if (!filters.patrimony && !filters.type && !filters.model && !filters.situation) return undefined;
  const documents = await EquipmentModel.find(applyEquipmentAttributes({}, filters)).select({ _id: 1 }).lean().exec();
  return documents.map((document) => String(document._id));
}

function transferFilter(filters: AcPatrimonialReportFilters, equipmentIds?: string[]) {
  const filter: Record<string, unknown> = { origin: 'AC', status: 'confirmed' };
  if (filters.unitId) filter['destinationUnit.id'] = filters.unitId;
  if (filters.bg) filter['bg.number'] = textExpression(filters.bg);
  const dates = dateRange(filters);
  if (dates) filter.distributedAt = dates;
  if (equipmentIds) filter['materials.equipmentId'] = { $in: equipmentIds };
  return filter;
}

function publicStock(document: any) {
  return {
    id: String(document._id),
    patrimony: document.patrimony,
    serialNumber: document.serialNumber ?? null,
    identification: document.brand,
    brand: document.brand,
    type: document.type,
    model: document.model,
    situation: document.situation,
  };
}

function publicDistribution(document: any) {
  return {
    id: String(document._id),
    distributedAt: new Date(document.distributedAt).toISOString(),
    destinationUnit: document.destinationUnit,
    deliverer: document.deliverer,
    receiver: document.receiver,
    quantity: new Set((document.materials ?? []).map((material: any) => material.equipmentId)).size,
    ...(document.bg?.number ? { bg: { number: document.bg.number } } : {}),
  };
}

function sourceForDescription(description: string): 'AC' | 'DITEL' {
  return /AC/i.test(description) ? 'AC' : 'DITEL';
}

export async function readAcPatrimonialReport(filters: AcPatrimonialReportFilters, page: AcPatrimonialReportPage) {
  const equipmentIds = await matchingEquipmentIds(filters);
  const stockFilter = equipmentFilter(filters, equipmentIds);
  const transferQuery = transferFilter(filters, equipmentIds);
  const direction: 1 | -1 = page.order === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = page.sort === 'patrimony'
    ? { 'materials.patrimony': direction, _id: 1 }
    : page.sort === 'destinationUnit'
      ? { 'destinationUnit.name': direction, distributedAt: -1, _id: 1 }
      : { distributedAt: direction, _id: 1 };

  const [stockTotal, stockDocuments, transferDocuments, transferTotal] = await Promise.all([
    EquipmentModel.countDocuments(stockFilter).exec(),
    EquipmentModel.find(stockFilter).select('patrimony serialNumber brand type model situation').sort({ patrimony: 1, _id: 1 }).skip((page.page - 1) * page.pageSize).limit(page.pageSize).lean().exec(),
    AcTransferModel.find(transferQuery).sort(sort).skip((page.page - 1) * page.pageSize).limit(page.pageSize).lean().exec(),
    AcTransferModel.countDocuments(transferQuery).exec(),
  ]);

  const allTransfers = await AcTransferModel.find(transferQuery).select('materials.equipmentId').lean().exec();
  const distributedGoods = new Set(allTransfers.flatMap((transfer) => (transfer.materials ?? []).map((material: any) => material.equipmentId))).size;
  const availableStock = await EquipmentModel.countDocuments({ ...stockFilter, situation: 'active' }).exec();

  const history = filters.patrimony
    ? await readAcPatrimonialHistory(filters.patrimony, filters)
    : null;

  return {
    metrics: { availableStock, distributedGoods, transfers: transferTotal },
    stock: { items: stockDocuments.map(publicStock), total: stockTotal, page: page.page, pageSize: page.pageSize },
    distributions: { items: transferDocuments.map(publicDistribution), total: transferTotal, page: page.page, pageSize: page.pageSize },
    history,
    criteria: {
      availableStock: 'Equipment distinto com custódia AC e situação active.',
      distributedGoods: 'equipmentId distinto em AcTransfer confirmado no recorte.',
      transfers: 'documentos AcTransfer confirmados no recorte.',
    },
  };
}

async function readAcPatrimonialHistory(patrimony: string, filters: AcPatrimonialReportFilters) {
  const equipment = await EquipmentModel.findOne({ patrimony }).lean().exec();
  if (!equipment) return { patrimony, entries: [] };
  const transfers = await AcTransferModel.find({ ...transferFilter(filters), 'materials.equipmentId': String(equipment._id) }).sort({ distributedAt: 1, _id: 1 }).lean().exec();
  const entries = [
    ...(equipment.history ?? []).map((entry: any) => ({ id: entry.id, source: sourceForDescription(entry.description), description: entry.description, occurredAt: new Date(entry.occurredAt).toISOString() })),
    ...transfers.map((transfer) => ({ id: String(transfer._id), source: 'AC' as const, description: 'Distribuição AC', occurredAt: new Date(transfer.distributedAt).toISOString(), bg: transfer.bg?.number ?? null })),
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  return { patrimony, entries };
}
