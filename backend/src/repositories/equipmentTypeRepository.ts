import type { ClientSession } from 'mongoose';

import { EquipmentTypeModel, type EquipmentTypeDocument } from '../models/EquipmentType.js';

export type EquipmentTypeInput = {
  name: string;
  description?: string;
  active?: boolean;
};

export type EquipmentTypeListItem = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toEquipmentTypeListItem(document: EquipmentTypeDocument & { _id?: unknown }): EquipmentTypeListItem {
  return {
    id: String(document._id),
    name: document.name,
    description: document.description ?? '',
    active: document.active ?? true,
    createdAt: document.createdAt instanceof Date ? document.createdAt : new Date(document.createdAt),
    updatedAt: document.updatedAt instanceof Date ? document.updatedAt : new Date(document.updatedAt),
  };
}

export async function listEquipmentTypes(includeInactive = false): Promise<EquipmentTypeListItem[]> {
  const documents = await EquipmentTypeModel.find(includeInactive ? {} : { active: true })
    .sort({ name: 1 })
    .lean()
    .exec();
  return documents.map((document) => toEquipmentTypeListItem(document as EquipmentTypeDocument));
}

export async function createEquipmentType(input: EquipmentTypeInput, session?: ClientSession): Promise<EquipmentTypeListItem> {
  const [document] = await EquipmentTypeModel.create([{
    name: input.name,
    description: input.description?.trim() ?? '',
    active: input.active ?? true,
  }], session ? { session } : undefined);
  return toEquipmentTypeListItem(document.toObject() as EquipmentTypeDocument);
}

export async function updateEquipmentType(
  id: string,
  input: Partial<EquipmentTypeInput>,
  session?: ClientSession,
): Promise<EquipmentTypeListItem | null> {
  const document = await EquipmentTypeModel.findByIdAndUpdate(
    id,
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    { new: true, runValidators: true, session },
  )
    .lean()
    .exec();
  return document ? toEquipmentTypeListItem(document as EquipmentTypeDocument) : null;
}

export async function findEquipmentTypeById(id: string, session?: ClientSession): Promise<EquipmentTypeDocument | null> {
  return EquipmentTypeModel.findById(id).session(session ?? null).lean().exec() as Promise<EquipmentTypeDocument | null>;
}

export async function equipmentTypeNameExists(name: string, exceptId?: string): Promise<boolean> {
  const query: Record<string, unknown> = { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } };
  if (exceptId) query._id = { $ne: exceptId };
  return EquipmentTypeModel.exists(query).exec().then(Boolean);
}

export async function deleteEquipmentType(id: string, session?: ClientSession): Promise<boolean> {
  const result = await EquipmentTypeModel.deleteOne({ _id: id }).session(session ?? null).exec();
  return result.deletedCount > 0;
}