import mongoose, { type ClientSession } from 'mongoose';

import { EquipmentModel, type EquipmentSituation } from '../models/Equipment.js';

export interface AcMaterialFilters {
  search?: string;
}

export interface AcMaterialCreateInput {
  patrimony: string;
  type: string;
  model: string;
  brand: string;
  situation: EquipmentSituation;
  location: string;
  serialNumber?: string;
  category?: string;
  warranty?: string;
  observations?: string;
  createdBy: string;
}

const AC_CUSTODY_FILTER = {
  'custody.scope': 'AC',
  'custody.unit': null,
  unit: null,
};

function publicAcMaterial(document: any) {
  return {
    id: String(document._id),
    patrimony: document.patrimony,
    type: document.type,
    model: document.model,
    brand: document.brand,
    situation: document.situation,
    location: document.location,
    unit: null,
    custody: { scope: 'AC', unit: null },
    ...(document.serialNumber ? { serialNumber: document.serialNumber } : {}),
    category: document.category ?? '',
    ...(document.warranty ? { warranty: document.warranty } : {}),
    ...(document.observations ? { observations: document.observations } : {}),
    ...(document.createdAt ? { createdAt: new Date(document.createdAt).toISOString() } : {}),
    ...(document.createdBy ? { createdBy: document.createdBy } : {}),
    ...(document.updatedAt ? { updatedAt: new Date(document.updatedAt).toISOString() } : {}),
    ...(document.updatedBy ? { updatedBy: document.updatedBy } : {}),
    history: (document.history ?? []).map((entry: any) => ({
      id: entry.id,
      description: entry.description,
      occurredAt: new Date(entry.occurredAt).toISOString(),
    })),
  };
}

function filterFor(filters: AcMaterialFilters): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...AC_CUSTODY_FILTER };
  if (filters.search) {
    const expression = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { patrimony: expression },
      { serialNumber: expression },
      { type: expression },
      { model: expression },
      { brand: expression },
      { category: expression },
      { observations: expression },
      { location: expression },
    ];
  }
  return filter;
}

export async function createAcMaterial(input: AcMaterialCreateInput, session?: ClientSession) {
  const [document] = await EquipmentModel.create([{
    ...input,
    unit: null,
    custody: { scope: 'AC', unit: null },
    history: [{
      id: `equipment-ac-entry-${new mongoose.Types.ObjectId().toString()}`,
      description: 'Entrada patrimonial na AC',
      occurredAt: new Date(),
    }],
  }], session ? { session } : undefined);
  return publicAcMaterial(document);
}

export async function readAcMaterials(filters: AcMaterialFilters, page: number, pageSize: number) {
  const filter = filterFor(filters);
  const [total, documents] = await Promise.all([
    EquipmentModel.countDocuments(filter).exec(),
    EquipmentModel.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .exec(),
  ]);
  return { items: documents.map(publicAcMaterial), total, page, pageSize };
}

export async function readAcMaterial(id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  const document = await EquipmentModel.findOne({ _id: id, ...AC_CUSTODY_FILTER }).lean().exec();
  return document ? publicAcMaterial(document) : null;
}
