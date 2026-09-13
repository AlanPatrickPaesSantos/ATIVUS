import { isValidUnitReference, type UnitReference, type UserRole } from '../models/User.js';
import { findActiveUnitReference } from '../repositories/unitsRepository.js';

export interface UnitUserAccessScope {
  role: 'unit_user';
  unitId: string;
  unit: UnitReference;
}

export interface DitelAdminAccessScope {
  role: 'ditel_admin';
  unitId: null;
  unit: null;
}

export type ActiveUnitAccessScope = UnitUserAccessScope | DitelAdminAccessScope;

export async function resolveCanonicalUnitForRole(
  role: UserRole,
  unit: unknown,
): Promise<UnitReference | null> {
  if (role !== 'unit_user' || !isValidUnitReference(unit)) {
    return null;
  }

  return await findActiveUnitReference(unit.id);
}

export async function resolveAccessScopeFromContext(
  context: { role: UserRole; unit: unknown } | undefined,
): Promise<ActiveUnitAccessScope | null> {
  if (!context) {
    return null;
  }

  if (context.role === 'ditel_admin') {
    return {
      role: 'ditel_admin',
      unitId: null,
      unit: null,
    };
  }

  const unit = await resolveCanonicalUnitForRole(context.role, context.unit);

  if (!unit) {
    return null;
  }

  return {
    role: context.role,
    unitId: unit.id,
    unit,
  };
}
