import type { ClientSession } from 'mongoose';
import { UserModel, type UnitReference, type UserRole, type UserSituation } from '../models/User.js';

export interface ActiveUser {
  id: string;
  name: string;
  registration: string;
  role: UserRole;
  active: true;
  situation: 'active';
  unit: UnitReference | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function findActiveUserByRegistration(registration: string): Promise<ActiveUser | null> {
  const user = await UserModel.findOne({ registration, situation: 'active' }).exec();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name as string,
    registration: user.registration as string,
    role: user.role as UserRole,
    active: true,
    situation: 'active',
    unit: publicUnit(user.unit as UnitReference | null | undefined),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export type AdminUserSituationFilter = 'Ativo' | 'Bloqueado' | 'Inativo';
export interface AdminUserFilters { search?: string; role?: UserRole; unitId?: string; situation?: AdminUserSituationFilter }

const situationByFilter: Record<AdminUserSituationFilter, UserSituation> = {
  Ativo: 'active',
  Bloqueado: 'blocked',
  Inativo: 'inactive',
};

function publicUnit(unit: UnitReference | null | undefined): UnitReference | null {
  return unit ? { id: unit.id, name: unit.name, acronym: unit.acronym } : null;
}

export interface AdminUserListItem {
  id: string;
  name: string;
  registration: string;
  role: UserRole;
  situation: UserSituation;
  unit: UnitReference | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUserAuditRecord extends AdminUserListItem {}

export interface AdminUserPasswordResetResult {
  previousMustChangePassword: boolean;
}

export interface OwnPasswordChangeResult {
  previousMustChangePassword: boolean;
}

export interface AdminUserCreateInput {
  name: string;
  registration: string;
  role: UserRole;
  password: string;
  unit: UnitReference | null;
}

export interface AdminUserUpdateInput {
  name: string;
  registration: string;
  role: UserRole;
  unit: UnitReference | null;
  updatedAt: Date;
}

export async function createAdminUser(input: AdminUserCreateInput, session?: ClientSession): Promise<AdminUserListItem> {
  const [user] = await UserModel.create([{
    name: input.name,
    registration: input.registration,
    role: input.role,
    situation: 'active',
    unit: input.unit,
    password: input.password,
  }], session ? { session } : undefined);

  return {
    id: user.id,
    name: user.name as string,
    registration: user.registration as string,
    role: user.role as UserRole,
    situation: user.situation as UserSituation,
    unit: publicUnit(user.unit as UnitReference | null | undefined),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function updateAdminUser(
  userId: string,
  input: AdminUserUpdateInput,
  session?: ClientSession,
): Promise<AdminUserListItem | null> {
  const query = UserModel.findOneAndUpdate(
    { _id: userId, updatedAt: input.updatedAt },
    {
      $set: {
        name: input.name,
        registration: input.registration,
        role: input.role,
        unit: input.unit,
      },
    },
    { new: true, runValidators: true, ...(session ? { session } : {}) },
  ).select({ _id: 1, name: 1, registration: 1, role: 1, situation: 1, unit: 1, createdAt: 1, updatedAt: 1 }).lean();

  const user = await query.exec() as unknown as Record<string, unknown> | null;

  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    name: String(user.name),
    registration: String(user.registration),
    role: user.role as UserRole,
    situation: user.situation as UserSituation,
    unit: publicUnit(user.unit as UnitReference | null | undefined),
    createdAt: user.createdAt as Date,
    updatedAt: user.updatedAt as Date,
  };
}

export async function listAdminUsers(filters: AdminUserFilters, page: number, pageSize: number) {
  const query: Record<string, unknown> = {};
  if (filters.search) query.$or = [{ name: { $regex: filters.search, $options: 'i' } }, { registration: { $regex: filters.search, $options: 'i' } }];
  if (filters.role) query.role = filters.role;
  if (filters.unitId) query['unit.id'] = filters.unitId;
  if (filters.situation) query.situation = situationByFilter[filters.situation];
  const [records, total] = await Promise.all([
    UserModel.find(query).select({ _id: 1, name: 1, registration: 1, role: 1, situation: 1, unit: 1, createdAt: 1, updatedAt: 1 }).sort({ name: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
    UserModel.countDocuments(query).exec(),
  ]);
  const publicRecords = records as unknown as Array<Record<string, unknown>>;
  return { items: publicRecords.map((user): AdminUserListItem => ({ id: String(user._id), name: String(user.name), registration: String(user.registration), role: user.role as UserRole, situation: user.situation as UserSituation, unit: publicUnit(user.unit as UnitReference | null | undefined), createdAt: user.createdAt as Date, updatedAt: user.updatedAt as Date })), total, page, pageSize };
}

export async function findAdminUserSituation(userId: string): Promise<UserSituation | null> {
  const user = await UserModel.findById(userId).select({ situation: 1 }).lean().exec();
  return user ? user.situation as UserSituation : null;
}

export async function findAdminUserAuditRecord(userId: string, session?: ClientSession): Promise<AdminUserAuditRecord | null> {
  const query = UserModel.findById(userId)
    .select({ _id: 1, name: 1, registration: 1, role: 1, situation: 1, unit: 1, createdAt: 1, updatedAt: 1 })
    .lean()
  if (session) {
    query.session(session);
  }
  const user = await query.exec();

  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    name: String(user.name),
    registration: String(user.registration),
    role: user.role as UserRole,
    situation: user.situation as UserSituation,
    unit: publicUnit(user.unit as UnitReference | null | undefined),
    createdAt: user.createdAt as Date,
    updatedAt: user.updatedAt as Date,
  };
}

export async function transitionAdminUserSituation(
  userId: string,
  currentSituation: UserSituation,
  nextSituation: 'active' | 'blocked',
  session?: ClientSession,
): Promise<boolean> {
  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, situation: currentSituation },
    { $set: { situation: nextSituation } },
    { new: true, runValidators: true, ...(session ? { session } : {}) },
  ).select({ _id: 1 }).lean().exec();

  return Boolean(updated);
}

export async function resetAdminUserPassword(
  userId: string,
  temporaryPassword: string,
  session?: ClientSession,
): Promise<AdminUserPasswordResetResult | null> {
  const query = UserModel.findOne({ _id: userId, situation: 'active' })
    .select('+passwordHash name registration role situation unit mustChangePassword');

  if (session) {
    query.session(session);
  }

  const user = await query.exec();

  if (!user) {
    return null;
  }

  const previousMustChangePassword = Boolean(user.mustChangePassword);
  user.set('password', temporaryPassword);
  user.set('mustChangePassword', true);
  await user.save(session ? { session } : undefined);

  return { previousMustChangePassword };
}

export async function changeOwnPasswordAfterRequiredReset(
  userId: string,
  newPassword: string,
  session?: ClientSession,
): Promise<OwnPasswordChangeResult | null> {
  const query = UserModel.findOne({ _id: userId, situation: 'active', mustChangePassword: true })
    .select('+passwordHash name registration role situation unit mustChangePassword');

  if (session) {
    query.session(session);
  }

  const user = await query.exec();

  if (!user) {
    return null;
  }

  const previousMustChangePassword = Boolean(user.mustChangePassword);
  user.set('password', newPassword);
  user.set('mustChangePassword', false);
  await user.save(session ? { session } : undefined);

  return { previousMustChangePassword };
}
