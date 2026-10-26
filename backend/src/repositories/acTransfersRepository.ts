import mongoose, { type ClientSession } from 'mongoose';

import {
  AcTransferModel,
  type AcTransferMaterialSnapshot,
  type ValidatedAcTransferRequest,
} from '../models/AcTransfer.js';
import { EquipmentModel, type EquipmentCustody } from '../models/Equipment.js';
import { UnitModel } from '../models/Unit.js';
import type { UnitReference } from '../models/User.js';

export class AcTransferDomainError extends Error {
  constructor(public readonly code: 'AC_MATERIAL_UNAVAILABLE' | 'AC_TRANSFER_CONFLICT' | 'AC_DESTINATION_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'AcTransferDomainError';
  }
}

const AC_CUSTODY_FILTER = { 'custody.scope': 'AC', 'custody.unit': null, unit: null };

function publicTransfer(document: any) {
  return {
    id: String(document._id),
    origin: document.origin,
    status: document.status,
    destinationUnit: document.destinationUnit,
    distributedAt: new Date(document.distributedAt).toISOString(),
    deliverer: document.deliverer,
    receiver: document.receiver,
    ...(document.bg?.number ? { bg: { number: document.bg.number } } : {}),
    materials: (document.materials ?? []).map((material: any) => ({
      equipmentId: material.equipmentId,
      patrimony: material.patrimony,
      ...(material.description ? { description: material.description } : {}),
      ...(material.identification ? { identification: material.identification } : {}),
      ...(material.model ? { model: material.model } : {}),
      ...(material.serialNumber ? { serialNumber: material.serialNumber } : {}),
      sourceCustody: { scope: 'AC', unit: null },
      equipmentUpdatedAt: new Date(material.equipmentUpdatedAt).toISOString(),
      equipmentVersion: material.equipmentVersion,
    })),
    createdAt: new Date(document.createdAt).toISOString(),
    createdBy: document.createdBy,
  };
}

export function toTransferSnapshot(document: any): AcTransferMaterialSnapshot {
  return {
    equipmentId: String(document._id),
    patrimony: document.patrimony,
    ...(typeof document.type === 'string' && document.type.trim() ? { description: document.type.trim() } : {}),
    ...(typeof document.brand === 'string' && document.brand.trim() ? { identification: document.brand.trim() } : {}),
    ...(typeof document.model === 'string' && document.model.trim() ? { model: document.model.trim() } : {}),
    ...(document.serialNumber ? { serialNumber: document.serialNumber } : {}),
    sourceCustody: { scope: 'AC', unit: null } satisfies EquipmentCustody,
    equipmentUpdatedAt: new Date(document.updatedAt),
    equipmentVersion: typeof document.__v === 'number' ? document.__v : 0,
  };
}

export async function findAcTransferByIdempotencyKey(idempotencyKey: string) {
  const document = await AcTransferModel.findOne({ idempotencyKey }).lean().exec();
  return document ? { fingerprint: document.fingerprint, transfer: publicTransfer(document) } : null;
}

export async function createAcTransferAndMoveMaterials(
  input: ValidatedAcTransferRequest,
  idempotencyKey: string,
  fingerprint: string,
  createdBy: string,
  session: ClientSession,
) {
  const destination = await UnitModel.findOne({ id: input.destinationUnit.id, active: true })
    .select({ _id: 0, id: 1, name: 1, acronym: 1 })
    .session(session)
    .lean()
    .exec();
  if (!destination) {
    throw new AcTransferDomainError('AC_DESTINATION_UNAVAILABLE', 'Unidade destino inexistente ou inativa.');
  }
  const destinationUnit: UnitReference = { id: destination.id, name: destination.name, acronym: destination.acronym };

  const equipment = await EquipmentModel.find({ _id: { $in: input.equipmentIds }, ...AC_CUSTODY_FILTER })
    .session(session)
    .lean()
    .exec();
  if (equipment.length !== input.equipmentIds.length) {
    throw new AcTransferDomainError('AC_MATERIAL_UNAVAILABLE', 'Um ou mais bens não estão disponíveis sob custódia AC.');
  }
  if (equipment.some((item) => item.situation !== 'active')) {
    throw new AcTransferDomainError('AC_MATERIAL_UNAVAILABLE', 'Somente bens patrimoniais ativos podem ser distribuídos.');
  }

  const byId = new Map(equipment.map((item) => [String(item._id), item]));
  const snapshots = input.equipmentIds.map((id) => {
    const item = byId.get(id);
    if (!item) throw new AcTransferDomainError('AC_MATERIAL_UNAVAILABLE', 'Um ou mais bens não estão disponíveis sob custódia AC.');
    return toTransferSnapshot(item);
  });

  for (const snapshot of snapshots) {
    const updated = await EquipmentModel.updateOne(
      {
        _id: snapshot.equipmentId,
        ...AC_CUSTODY_FILTER,
        updatedAt: snapshot.equipmentUpdatedAt,
        __v: snapshot.equipmentVersion,
      },
      {
        $set: { custody: { scope: 'UNIT', unit: destinationUnit }, unit: destinationUnit, updatedBy: createdBy },
        $push: { history: { id: `equipment-ac-transfer-${new mongoose.Types.ObjectId().toString()}`, description: 'Distribuição AC para unidade', occurredAt: new Date() } },
        $inc: { __v: 1 },
      },
      { session },
    ).exec();
    if (updated.matchedCount !== 1) {
      throw new AcTransferDomainError('AC_TRANSFER_CONFLICT', 'Um ou mais bens foram alterados por outra operação.');
    }
  }

  const [transfer] = await AcTransferModel.create([{
    origin: 'AC',
    status: 'confirmed',
    destinationUnit,
    distributedAt: input.distributedAt,
    deliverer: input.deliverer,
    receiver: input.receiver,
    bg: input.bg,
    materials: snapshots,
    createdBy,
    idempotencyKey,
    fingerprint,
  }], { session });

  return publicTransfer(transfer.toObject());
}

export async function listAcTransfers(page: number, pageSize: number) {
  const filter = {};
  const [total, documents] = await Promise.all([
    AcTransferModel.countDocuments(filter).exec(),
    AcTransferModel.find(filter).sort({ distributedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
  ]);
  return { items: documents.map(publicTransfer), total, page, pageSize };
}

export async function readAcTransfer(id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  const document = await AcTransferModel.findById(id).lean().exec();
  return document ? publicTransfer(document) : null;
}
