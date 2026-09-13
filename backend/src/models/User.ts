import mongoose, {
  Schema,
  type InferSchemaType,
  type Model,
  type Query,
  type UpdateQuery,
} from 'mongoose';

import {
  hashPassword,
  isBcryptHash,
  PASSWORD_HASH_INPUT_ERROR,
  PASSWORD_REPLACE_ERROR,
  PASSWORD_UPDATE_ERROR,
} from './passwordHash.js';

export type UserRole = 'ditel_admin' | 'unit_user';
export type UserSituation = 'active' | 'blocked' | 'inactive';

export const USER_SITUATIONS = ['active', 'blocked', 'inactive'] as const satisfies UserSituation[];

export interface UnitReference {
  id: string;
  name: string;
  acronym: string;
}

export const UNIT_USER_UNIT_REQUIRED_ERROR = 'Usuário de unidade deve possuir uma unidade válida.';
export const USER_SCOPE_UPDATE_UNVERIFIABLE_ERROR = 'Atualização de perfil/unidade não verificável.';

export function isValidUnitReference(value: unknown): value is UnitReference {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const unit = value as Partial<UnitReference>;

  return typeof unit.id === 'string'
    && unit.id.trim().length > 0
    && typeof unit.name === 'string'
    && unit.name.trim().length > 0
    && typeof unit.acronym === 'string'
    && unit.acronym.trim().length > 0;
}

export function assertValidUserRoleUnit(role: unknown, unit: unknown): void {
  if (role === 'unit_user') {
    if (!isValidUnitReference(unit)) {
      throw new Error(UNIT_USER_UNIT_REQUIRED_ERROR);
    }
    return;
  }

  if (role === 'ditel_admin') {
    if (unit !== null && !isValidUnitReference(unit)) {
      throw new Error(UNIT_USER_UNIT_REQUIRED_ERROR);
    }
    return;
  }

  throw new Error('Perfil de usuário inválido.');
}

const unitReferenceSchema = new Schema<UnitReference>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    acronym: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    registration: { type: String, required: true, trim: true },
    role: {
      type: String,
      required: true,
      enum: ['ditel_admin', 'unit_user'] satisfies UserRole[],
    },
    situation: { type: String, required: true, enum: USER_SITUATIONS, default: 'active' },
    unit: { type: unitReferenceSchema, default: null },
    mustChangePassword: { type: Boolean, required: true, default: false },
    passwordHash: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        const serialized = ret as Record<string, unknown>;
        delete serialized.passwordHash;
        return serialized;
      },
    },
    toObject: {
      transform: (_doc, ret) => {
        const serialized = ret as Record<string, unknown>;
        delete serialized.passwordHash;
        return serialized;
      },
    },
  },
);

userSchema.index({ registration: 1 }, { unique: true });

// `active` was the old write-side flag. Keep it as a non-persisted adapter so
// existing callers migrate safely while `situation` remains the only stored state.
userSchema.virtual('active')
  .get(function getActiveFromSituation() {
    return this.situation === 'active';
  })
  .set(function setLegacyActive(value: unknown) {
    this.$locals.legacyActive = value;
  });

userSchema.virtual('password').set(function setPassword(password: string) {
  this.$locals.password = password;
});

userSchema.pre('validate', function normalizeLegacyActive() {
  const legacyActive = this.$locals.legacyActive;
  if (!this.isModified('situation') && typeof legacyActive === 'boolean') {
    this.situation = legacyActive ? 'active' : 'inactive';
  }
  delete this.$locals.legacyActive;
});

userSchema.pre('validate', function validateUnitScope() {
  try {
    assertValidUserRoleUnit(this.role, this.unit);
  } catch (error) {
    const message = error instanceof Error ? error.message : UNIT_USER_UNIT_REQUIRED_ERROR;
    this.invalidate(this.role === 'ditel_admin' || this.role === 'unit_user' ? 'unit' : 'role', message);
  }
});

async function applyPasswordToDocument(document: {
  $locals?: Record<string, unknown>;
  invalidate(path: string, errorMsg: string): void;
  isModified(path: string): boolean;
  isNew?: boolean;
  passwordHash?: string;
}) {
  const password = document.$locals?.password;

  if (typeof password === 'string') {
    document.passwordHash = await hashPassword(password);
    if (document.$locals) {
      delete (document.$locals as { password?: unknown }).password;
    }
    return;
  }

  if (document.isModified('passwordHash') && document.passwordHash && !isBcryptHash(document.passwordHash)) {
    document.invalidate('passwordHash', PASSWORD_HASH_INPUT_ERROR);
    return;
  }

  if (document.isNew && !document.passwordHash) {
    document.invalidate('passwordHash', 'Path `passwordHash` is required.');
  }
}

function hasPasswordField(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasPasswordField(item));
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    const terminalKey = key.split('.').at(-1);

    if (terminalKey === 'password' || terminalKey === 'passwordHash') {
      return true;
    }

    return hasPasswordField(nestedValue);
  });
}

function assertPasswordQueryIsSafe(update: UpdateQuery<unknown> | unknown[] | null | undefined) {
  if (hasPasswordField(update)) {
    throw new Error(PASSWORD_UPDATE_ERROR);
  }
}

function normalizeLegacyActiveFilter(filter: unknown): unknown {
  if (Array.isArray(filter)) {
    return filter.map(normalizeLegacyActiveFilter);
  }
  if (!isRecord(filter)) {
    return filter;
  }

  const normalized = { ...filter };
  if (typeof normalized.active === 'boolean') {
    normalized.situation = normalized.situation ?? (normalized.active ? 'active' : 'inactive');
    delete normalized.active;
  }

  for (const [key, value] of Object.entries(normalized)) {
    if (key.startsWith('$')) {
      normalized[key] = normalizeLegacyActiveFilter(value);
    }
  }
  return normalized;
}

function normalizeLegacyActiveUpdate(update: unknown): unknown {
  if (Array.isArray(update) || !isRecord(update)) {
    return update;
  }

  const normalized = { ...update };
  const set = isRecord(normalized.$set) ? { ...normalized.$set } : null;
  if (set && typeof set.active === 'boolean') {
    set.situation = set.situation ?? (set.active ? 'active' : 'inactive');
    delete set.active;
    normalized.$set = set;
  }
  if (typeof normalized.active === 'boolean') {
    normalized.situation = normalized.situation ?? (normalized.active ? 'active' : 'inactive');
    delete normalized.active;
  }
  return normalized;
}

function assertReplaceOnePayloadIsSafe(replacement: unknown) {
  if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) {
    throw new Error(PASSWORD_REPLACE_ERROR);
  }

  const candidate = replacement as Record<string, unknown>;

  if ('password' in candidate) {
    throw new Error(PASSWORD_UPDATE_ERROR);
  }

  if (typeof candidate.passwordHash !== 'string' || !isBcryptHash(candidate.passwordHash)) {
    throw new Error(PASSWORD_REPLACE_ERROR);
  }

  assertValidUserRoleUnit(candidate.role, candidate.unit);
}

interface UserScopeState {
  role: unknown;
  unit: unknown;
}

interface UserScopeSnapshot extends UserScopeState {
  _id: unknown;
  hasUnit: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneUnitForProjection(unit: unknown): unknown {
  return isRecord(unit) ? { ...unit } : unit;
}

function isUserScopePath(path: string): boolean {
  return path === 'role' || path === 'unit' || path.startsWith('unit.');
}

function applyScopePath(state: UserScopeState, path: string, value: unknown, unset = false): void {
  if (path === 'role') {
    state.role = unset ? undefined : value;
    return;
  }

  if (path === 'unit') {
    state.unit = unset ? undefined : cloneUnitForProjection(value);
    return;
  }

  if (!path.startsWith('unit.')) {
    return;
  }

  const unitField = path.slice('unit.'.length);

  if (!['id', 'name', 'acronym'].includes(unitField)) {
    throw new Error(USER_SCOPE_UPDATE_UNVERIFIABLE_ERROR);
  }

  const projectedUnit = isRecord(state.unit) ? { ...state.unit } : {};

  if (unset) {
    delete projectedUnit[unitField];
  } else {
    projectedUnit[unitField] = value;
  }

  state.unit = projectedUnit;
}

function operatorTouchesUserScope(operator: string, payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  return Object.entries(payload).some(([path, value]) => {
    if (isUserScopePath(path)) {
      return true;
    }

    return operator === '$rename' && typeof value === 'string' && isUserScopePath(value);
  });
}

function projectUserScope(update: unknown, snapshot: UserScopeSnapshot): UserScopeState {
  if (!isRecord(update)) {
    throw new Error(USER_SCOPE_UPDATE_UNVERIFIABLE_ERROR);
  }

  const projected: UserScopeState = {
    role: snapshot.role,
    unit: cloneUnitForProjection(snapshot.unit),
  };

  for (const [operatorOrPath, payload] of Object.entries(update)) {
    if (!operatorOrPath.startsWith('$')) {
      applyScopePath(projected, operatorOrPath, payload);
      continue;
    }

    if (operatorOrPath === '$set' || operatorOrPath === '$unset') {
      if (!isRecord(payload)) {
        throw new Error(USER_SCOPE_UPDATE_UNVERIFIABLE_ERROR);
      }

      for (const [path, value] of Object.entries(payload)) {
        applyScopePath(projected, path, value, operatorOrPath === '$unset');
      }
      continue;
    }

    if (operatorOrPath === '$setOnInsert') {
      continue;
    }

    if (operatorTouchesUserScope(operatorOrPath, payload)) {
      throw new Error(USER_SCOPE_UPDATE_UNVERIFIABLE_ERROR);
    }
  }

  return projected;
}

function snapshotGuard(snapshot: UserScopeSnapshot): Record<string, unknown> {
  return {
    _id: snapshot._id,
    role: snapshot.role,
    unit: snapshot.hasUnit ? snapshot.unit : { $exists: false },
  };
}

async function assertUserScopeQueryIsSafe(
  query: Query<unknown, unknown>,
  update: UpdateQuery<unknown> | unknown[] | null | undefined,
): Promise<void> {
  if (Array.isArray(update) || query.getOptions().upsert) {
    throw new Error(USER_SCOPE_UPDATE_UNVERIFIABLE_ERROR);
  }

  const originalFilter = normalizeLegacyActiveFilter(query.getFilter()) as Record<string, unknown>;
  const records = await query.model
    .find(originalFilter)
    .select({ _id: 1, role: 1, unit: 1 })
    .lean()
    .exec() as Array<Record<string, unknown>>;
  const snapshots = records.map((record): UserScopeSnapshot => ({
    _id: record._id,
    role: record.role,
    unit: record.unit,
    hasUnit: Object.prototype.hasOwnProperty.call(record, 'unit'),
  }));

  for (const snapshot of snapshots) {
    const projected = projectUserScope(update, snapshot);
    assertValidUserRoleUnit(projected.role, projected.unit);
  }

  query.setQuery({
    $and: [
      originalFilter,
      snapshots.length > 0
        ? { $or: snapshots.map((snapshot) => snapshotGuard(snapshot)) }
        : { _id: { $in: [] } },
    ],
  });
}

async function normalizeInsertManyPayload(
  payload: Record<string, unknown>,
): Promise<void> {
  const password = payload.password;
  const passwordHash = payload.passwordHash;

  if (typeof password === 'string') {
    payload.passwordHash = await hashPassword(password);
    delete (payload as { password?: unknown }).password;
    return;
  }

  if (typeof passwordHash === 'string' && !isBcryptHash(passwordHash)) {
    throw new Error(PASSWORD_HASH_INPUT_ERROR);
  }
}

userSchema.pre('validate', async function validateUserPassword() {
  await applyPasswordToDocument(this);
});

userSchema.pre('insertMany', function guardInsertMany(next, documents: Array<Record<string, unknown>>) {
  Promise.all(documents.map(async (document) => normalizeInsertManyPayload(document)))
    .then(() => next())
    .catch(next);
});

for (const operation of ['updateOne', 'findOneAndUpdate', 'updateMany'] as const) {
  userSchema.pre(operation, async function blockUnsafeUserWrites(this: Query<unknown, unknown>) {
    const update = normalizeLegacyActiveUpdate(this.getUpdate()) as UpdateQuery<unknown>;
    this.setUpdate(update);

    assertPasswordQueryIsSafe(update);
    await assertUserScopeQueryIsSafe(this, update);
  });
}

userSchema.pre('replaceOne', function blockUnsafeUserReplacement(this: Query<unknown, unknown>) {
  const replacement = normalizeLegacyActiveUpdate(this.getUpdate());
  this.setUpdate(replacement as UpdateQuery<unknown>);
  assertReplaceOnePayloadIsSafe(replacement);
});

export type UserDocument = InferSchemaType<typeof userSchema>;
type UserModelType = Model<UserDocument>;

export const UserModel = (mongoose.models.User as UserModelType | undefined)
  ?? mongoose.model<UserDocument>('User', userSchema);
