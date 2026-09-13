import { UnitModel } from '../models/Unit.js';

export interface UnitListItem { id: string; name: string; acronym: string }

export async function findActiveUnitReference(unitId: string): Promise<UnitListItem | null> {
  const unit = await UnitModel.findOne({ id: unitId, active: true })
    .select({ _id: 0, id: 1, name: 1, acronym: 1 })
    .lean()
    .exec();

  return unit ? { id: unit.id, name: unit.name, acronym: unit.acronym } : null;
}

export async function listActiveUnits(excludedUnitId?: string): Promise<{ items: UnitListItem[] }> {
  const filter = excludedUnitId ? { active: true, id: { $ne: excludedUnitId } } : { active: true };
  const items = await UnitModel.find(filter).select({ _id: 0, id: 1, name: 1, acronym: 1 }).sort({ name: 1, id: 1 }).lean().exec();
  return { items: items.map((item) => ({ id: item.id, name: item.name, acronym: item.acronym })) };
}
