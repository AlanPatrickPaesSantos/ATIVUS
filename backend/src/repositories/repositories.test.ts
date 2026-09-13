import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { SessionModel } from '../models/Session.js';
import { UserModel } from '../models/User.js';
import { recordAuditEvent } from './auditRepository.js';
import {
  createSession,
  findSession,
  revokeSession,
  touchSession,
} from './sessionsRepository.js';
import { findActiveUserByRegistration } from './usersRepository.js';

async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);

  await Promise.all(collections.map(async (collection) => collection.deleteMany({})));
}

function passwordHashOf(document: { passwordHash?: unknown } | null | undefined): string {
  return typeof document?.passwordHash === 'string' ? document.passwordHash : '';
}

function digestSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const VALID_UNIT = {
  id: 'unit-test',
  name: 'Unidade de Teste',
  acronym: 'UT',
};

describe('repositories', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    await connectToDatabase(mongoServer.getUri());
    await Promise.all([UserModel.init(), SessionModel.init(), AuditEventModel.init()]);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('rejects a unit user without a Unit', async () => {
    await expect(
      UserModel.create({
        name: 'Usuário sem unidade',
        registration: '10000',
        role: 'unit_user',
        active: true,
        unit: null,
        password: 'senha-segura',
      }),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');
  });

  it('rejects a unit user whose Unit id is empty', async () => {
    await expect(
      UserModel.create({
        name: 'Usuário com unidade inválida',
        registration: '10001',
        role: 'unit_user',
        active: true,
        unit: {
          id: '   ',
          name: '1ª Companhia',
          acronym: '1CIA',
        },
        password: 'senha-segura',
      }),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');
  });

  it('rejects a unit user whose Unit id is absent', async () => {
    await expect(
      UserModel.create({
        name: 'Usuário com unidade incompleta',
        registration: '10002',
        role: 'unit_user',
        active: true,
        unit: {
          name: '1ª Companhia',
          acronym: '1CIA',
        },
        password: 'senha-segura',
      }),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');
  });

  it('allows a DITEL administrator without a Unit', async () => {
    const administrator = await UserModel.create({
      name: 'Administrador DITEL',
      registration: '10003',
      role: 'ditel_admin',
      active: true,
      unit: null,
      password: 'senha-segura',
    });

    expect(administrator.unit).toBeNull();
  });

  it('finds an active user by registration without exposing the password hash', async () => {
    await UserModel.create({
      name: 'Ana Martins',
      registration: '12345',
      role: 'unit_user',
      active: true,
      unit: {
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
      },
      password: 'senha-segura-123',
    });

    const user = await findActiveUserByRegistration('12345');
    const storedUser = await UserModel.findOne({ registration: '12345' })
      .select('+passwordHash')
      .lean();

    expect(user).toMatchObject({
      name: 'Ana Martins',
      registration: '12345',
      role: 'unit_user',
      active: true,
      unit: {
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
      },
    });
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password');
    expect(storedUser?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('senha-segura-123', passwordHashOf(storedUser))).toBe(true);
  });

  it('hashes plaintext passwords during document save', async () => {
    const user = new UserModel({
      name: 'Bianca Freitas',
      registration: '10101',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-save',
    });

    await user.save();

    const hiddenUser = await UserModel.findOne({ registration: '10101' }).lean();
    const storedUser = await UserModel.findOne({ registration: '10101' })
      .select('+passwordHash')
      .lean();

    expect(hiddenUser).not.toHaveProperty('passwordHash');
    expect(hiddenUser).not.toHaveProperty('password');
    expect(storedUser?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('senha-save', passwordHashOf(storedUser))).toBe(true);
  });

  it('returns null when the registration belongs to an inactive user', async () => {
    await UserModel.create({
      name: 'Carlos Souza',
      registration: '54321',
      role: 'ditel_admin',
      active: false,
      unit: null,
      password: 'outra-senha',
    });

    const user = await findActiveUserByRegistration('54321');

    expect(user).toBeNull();
  });

  it('uses situation as the canonical access state even when a legacy active flag is present', async () => {
    await UserModel.create({
      name: 'Usuária bloqueada',
      registration: '54322',
      role: 'unit_user',
      active: true,
      situation: 'blocked',
      unit: VALID_UNIT,
      password: 'senha-bloqueada',
    });

    const user = await findActiveUserByRegistration('54322');

    expect(user).toBeNull();
    const storedUser = await UserModel.findOne({ registration: '54322' }).lean();
    expect(storedUser).toMatchObject({ situation: 'blocked' });
    expect(storedUser).not.toHaveProperty('active');
  });

  it('hashes plaintext passwords during insertMany and keeps passwordHash hidden by default', async () => {
    await UserModel.insertMany([
      {
        name: 'Marina Lima',
        registration: '98765',
        role: 'unit_user',
        active: true,
        unit: {
          id: 'unit-9',
          name: '9ª Companhia',
          acronym: '9CIA',
        },
        password: 'senha-insert-many',
      },
    ]);

    const hiddenUser = await UserModel.findOne({ registration: '98765' }).lean();
    const storedUser = await UserModel.findOne({ registration: '98765' })
      .select('+passwordHash')
      .lean();

    expect(hiddenUser).not.toHaveProperty('passwordHash');
    expect(hiddenUser).not.toHaveProperty('password');
    expect(storedUser?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('senha-insert-many', passwordHashOf(storedUser))).toBe(true);
  });

  it('rejects direct plaintext passwordHash writes during create', async () => {
    await expect(
      UserModel.create({
        name: 'Helena Costa',
        registration: '33333',
        role: 'unit_user',
        active: true,
        unit: VALID_UNIT,
        passwordHash: 'nao-pode-ser-texto-puro',
      }),
    ).rejects.toThrow('Use `password` for plaintext secrets; `passwordHash` only accepts bcrypt hashes');
  });

  it('blocks updateOne from writing plaintext password data', async () => {
    await UserModel.create({
      name: 'Lucia Rocha',
      registration: '11111',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-original',
    });

    await expect(
      UserModel.updateOne(
        { registration: '11111' },
        { $set: { password: 'senha-em-texto-puro' } },
      ),
    ).rejects.toThrow('Password updates must use the dedicated password hashing flow');

    await expect(
      UserModel.updateOne(
        { registration: '11111' },
        { $set: { passwordHash: 'hash-falso-em-texto-puro' } },
      ),
    ).rejects.toThrow('Password updates must use the dedicated password hashing flow');
  });

  it('blocks updateMany from writing plaintext password data', async () => {
    await UserModel.create({
      name: 'Marta Dias',
      registration: '12121',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-update-many',
    });

    await expect(
      UserModel.updateMany(
        { role: 'unit_user' },
        { $set: { password: 'senha-vazada-em-lote' } },
      ),
    ).rejects.toThrow('Password updates must use the dedicated password hashing flow');
  });

  it('blocks findOneAndUpdate from writing plaintext password data', async () => {
    await UserModel.create({
      name: 'Paulo Nunes',
      registration: '22222',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-inicial',
    });

    await expect(
      UserModel.findOneAndUpdate(
        { registration: '22222' },
        { $set: { password: 'senha-vazada' } },
      ),
    ).rejects.toThrow('Password updates must use the dedicated password hashing flow');

    const storedUser = await UserModel.findOne({ registration: '22222' })
      .select('+passwordHash')
      .lean();

    expect(await bcrypt.compare('senha-inicial', passwordHashOf(storedUser))).toBe(true);
    expect(await bcrypt.compare('senha-vazada', passwordHashOf(storedUser))).toBe(false);
  });

  it('blocks updateOne from removing the Unit of a unit user', async () => {
    await UserModel.create({
      name: 'Usuária com escopo protegido',
      registration: '22223',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-update-one-unit',
    });

    await expect(
      UserModel.updateOne(
        { registration: '22223' },
        { $unset: { unit: 1 } },
      ),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');

    const storedUser = await UserModel.findOne({ registration: '22223' }).lean();

    expect(storedUser?.role).toBe('unit_user');
    expect(storedUser?.unit).toMatchObject(VALID_UNIT);
  });

  it('blocks updateOne from emptying the Unit id of a unit user', async () => {
    await UserModel.create({
      name: 'Usuária com identificador protegido',
      registration: '22229',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-update-one-unit-id',
    });

    await expect(
      UserModel.updateOne(
        { registration: '22229' },
        { $set: { 'unit.id': '   ' } },
      ),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');

    const storedUser = await UserModel.findOne({ registration: '22229' }).lean();

    expect(storedUser?.role).toBe('unit_user');
    expect(storedUser?.unit).toMatchObject(VALID_UNIT);
  });

  it('blocks updateMany from changing administrators without Units into unit users', async () => {
    await UserModel.create([
      {
        name: 'Administradora sem unidade A',
        registration: '22224',
        role: 'ditel_admin',
        active: true,
        unit: null,
        password: 'senha-update-many-a',
      },
      {
        name: 'Administrador sem unidade B',
        registration: '22225',
        role: 'ditel_admin',
        active: true,
        unit: null,
        password: 'senha-update-many-b',
      },
    ]);

    await expect(
      UserModel.updateMany(
        { registration: { $in: ['22224', '22225'] } },
        { $set: { role: 'unit_user' } },
      ),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');

    const storedUsers = await UserModel.find({ registration: { $in: ['22224', '22225'] } })
      .sort({ registration: 1 })
      .lean();

    expect(storedUsers.map(({ role, unit }) => ({ role, unit }))).toEqual([
      { role: 'ditel_admin', unit: null },
      { role: 'ditel_admin', unit: null },
    ]);
  });

  it('blocks findOneAndUpdate from assigning unit_user to an administrator without a Unit', async () => {
    await UserModel.create({
      name: 'Administrador sem unidade',
      registration: '22226',
      role: 'ditel_admin',
      active: true,
      unit: null,
      password: 'senha-find-one-and-update',
    });

    await expect(
      UserModel.findOneAndUpdate(
        { registration: '22226' },
        { $set: { role: 'unit_user' } },
        { new: true },
      ),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');

    const storedUser = await UserModel.findOne({ registration: '22226' }).lean();

    expect(storedUser?.role).toBe('ditel_admin');
    expect(storedUser?.unit).toBeNull();
  });

  it('allows query updates whose final role and Unit combination is valid', async () => {
    await UserModel.create({
      name: 'Administradora promovida para unidade',
      registration: '22227',
      role: 'ditel_admin',
      active: true,
      unit: null,
      password: 'senha-valid-scope-update',
    });

    await UserModel.updateOne(
      { registration: '22227' },
      { $set: { role: 'unit_user', unit: VALID_UNIT } },
    );

    const storedUser = await UserModel.findOne({ registration: '22227' }).lean();

    expect(storedUser?.role).toBe('unit_user');
    expect(storedUser?.unit).toMatchObject(VALID_UNIT);
  });

  it('fails closed when a User update uses an unverifiable aggregation pipeline', async () => {
    await UserModel.create({
      name: 'Usuária protegida contra pipeline',
      registration: '22228',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-pipeline',
    });

    await expect(
      UserModel.updateOne(
        { registration: '22228' },
        [{ $set: { unit: null } }],
      ),
    ).rejects.toThrow('Atualização de perfil/unidade não verificável.');

    const storedUser = await UserModel.findOne({ registration: '22228' }).lean();

    expect(storedUser?.role).toBe('unit_user');
    expect(storedUser?.unit).toMatchObject(VALID_UNIT);
  });

  it('rejects replaceOne when the replacement omits passwordHash', async () => {
    await UserModel.create({
      name: 'Rafael Castro',
      registration: '23232',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-replace',
    });

    await expect(
      UserModel.replaceOne(
        { registration: '23232' },
        {
          name: 'Rafael Castro',
          registration: '23232',
          role: 'unit_user',
          active: true,
          unit: VALID_UNIT,
        },
      ),
    ).rejects.toThrow('Replacement documents must preserve a valid passwordHash');
  });

  it('rejects replaceOne when the complete replacement has an invalid role and Unit combination', async () => {
    await UserModel.create({
      name: 'Usuária substituída',
      registration: '23233',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-replace-scope',
    });
    const originalUser = await UserModel.findOne({ registration: '23233' })
      .select('+passwordHash')
      .lean();
    const originalPasswordHash = passwordHashOf(originalUser);

    await expect(
      UserModel.replaceOne(
        { registration: '23233' },
        {
          name: 'Usuária substituída',
          registration: '23233',
          role: 'unit_user',
          active: true,
          unit: null,
          passwordHash: originalPasswordHash,
        },
      ),
    ).rejects.toThrow('Usuário de unidade deve possuir uma unidade válida.');

    const storedUser = await UserModel.findOne({ registration: '23233' }).lean();

    expect(storedUser?.role).toBe('unit_user');
    expect(storedUser?.unit).toMatchObject(VALID_UNIT);
  });

  it('allows replaceOne with a complete DITEL administrator replacement and a null Unit', async () => {
    await UserModel.create({
      name: 'Administrador antes da substituição',
      registration: '23234',
      role: 'unit_user',
      active: true,
      unit: VALID_UNIT,
      password: 'senha-replace-valid',
    });
    const originalUser = await UserModel.findOne({ registration: '23234' })
      .select('+passwordHash')
      .lean();
    const originalPasswordHash = passwordHashOf(originalUser);

    await UserModel.replaceOne(
      { registration: '23234' },
      {
        name: 'Administrador depois da substituição',
        registration: '23234',
        role: 'ditel_admin',
        active: true,
        unit: null,
        passwordHash: originalPasswordHash,
      },
    );

    const storedUser = await UserModel.findOne({ registration: '23234' }).lean();

    expect(storedUser).toMatchObject({
      name: 'Administrador depois da substituição',
      role: 'ditel_admin',
      unit: null,
    });
  });

  it('rejects truncated bcrypt hashes during create', async () => {
    await expect(
      UserModel.create({
        name: 'Renata Silva',
        registration: '34343',
        role: 'unit_user',
        active: true,
        unit: VALID_UNIT,
        passwordHash: '$2b$12$abcdefghijklmnopqrstuu123456789012345678901234567',
      }),
    ).rejects.toThrow('Use `password` for plaintext secrets; `passwordHash` only accepts bcrypt hashes');
  });

  it('creates, finds and revokes an opaque session', async () => {
    const lastActivityAt = new Date('2026-09-01T10:00:00.000Z');
    const expiresAt = new Date('2026-09-01T22:00:00.000Z');
    const refreshedAt = new Date('2026-09-01T10:05:00.000Z');
    const sessionId = await createSession('user-123', { lastActivityAt, expiresAt });
    const tokenDigest = digestSessionToken(sessionId);

    const activeSession = await findSession(sessionId);
    const storedActiveSession = await SessionModel.findOne({ tokenDigest }).lean();

    expect(sessionId).toEqual(expect.any(String));
    expect(sessionId.length).toBeGreaterThanOrEqual(32);
    expect(activeSession).toMatchObject({
      userId: 'user-123',
      lastActivityAt,
      expiresAt,
      revokedAt: null,
    });
    expect(activeSession).not.toHaveProperty('sessionId');
    expect(activeSession).not.toHaveProperty('tokenDigest');
    expect(storedActiveSession).toMatchObject({
      tokenDigest,
      userId: 'user-123',
      lastActivityAt,
      expiresAt,
      revokedAt: null,
    });
    expect(storedActiveSession).not.toHaveProperty('sessionId');

    await touchSession(sessionId, refreshedAt);

    const refreshedSession = await findSession(sessionId);
    expect(refreshedSession?.lastActivityAt).toEqual(refreshedAt);

    await revokeSession(sessionId);

    const revokedSession = await findSession(sessionId);
    const storedSession = await SessionModel.findOne({ tokenDigest }).lean();

    expect(revokedSession).toBeNull();
    expect(storedSession?.revokedAt).toEqual(expect.any(Date));
  });

  it('records an audit event with action, user, result and date', async () => {
    const auditEvent = await recordAuditEvent({
      action: 'auth.login',
      userId: 'user-123',
      result: 'success',
    });

    const storedAuditEvent = await AuditEventModel.findById(auditEvent.id).lean();

    expect(storedAuditEvent).toMatchObject({
      action: 'auth.login',
      userId: 'user-123',
      result: 'success',
    });
    expect(storedAuditEvent?.createdAt).toEqual(expect.any(Date));
  });

  it('creates the required indexes for registration, session lookup and audit ordering', async () => {
    const userIndexes = await UserModel.collection.indexes();
    const sessionIndexes = await SessionModel.collection.indexes();
    const auditIndexes = await AuditEventModel.collection.indexes();

    expect(
      userIndexes.some((index) => index.key.registration === 1 && index.unique === true),
    ).toBe(true);
    expect(
      sessionIndexes.some((index) => index.key.tokenDigest === 1 && index.unique === true),
    ).toBe(true);
    expect(
      sessionIndexes.some((index) => index.key.expiresAt === 1),
    ).toBe(true);
    expect(
      auditIndexes.some((index) => index.key.createdAt === -1),
    ).toBe(true);
  });
});
