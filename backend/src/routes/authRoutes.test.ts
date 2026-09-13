import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);

  await Promise.all(collections.map(async (collection) => collection.deleteMany({})));
}

function extractCookieValue(setCookieHeader: string | undefined, cookieName: string): string | null {
  if (!setCookieHeader) {
    return null;
  }

  const cookiePair = setCookieHeader.split(';')[0];
  const [name, value] = cookiePair.split('=');

  if (name !== cookieName || !value) {
    return null;
  }

  return value;
}

function digestSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function upsertUnit(
  unit: { id: string; name: string; acronym: string },
  active = true,
) {
  await UnitModel.updateOne(
    { id: unit.id },
    { $set: { ...unit, active } },
    { upsert: true },
  );
}

describe('auth routes', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    await connectToDatabase(mongoServer.getUri());
    await Promise.all([UserModel.init(), SessionModel.init(), AuditEventModel.init(), UnitModel.init()]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('creates a persisted session and returns the session context on valid login', async () => {
    await upsertUnit({
      id: 'unit-1',
      name: '1ª Companhia',
      acronym: '1CIA',
    });

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

    const response = await request(createApp()).post('/api/v1/auth/login').send({
      registration: '12345',
      password: 'senha-segura-123',
    });

    const setCookieHeader = response.headers['set-cookie']?.[0];
    const sessionId = extractCookieValue(setCookieHeader, 'sigat_session');
    const storedSession = sessionId
      ? await SessionModel.findOne({ tokenDigest: digestSessionToken(sessionId) }).lean()
      : null;
    const auditEvents = await AuditEventModel.find().sort({ createdAt: 1 }).lean();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: expect.any(String),
      name: 'Ana Martins',
      registration: '12345',
      role: 'unit_user',
      unit: {
        id: 'unit-1',
        name: '1ª Companhia',
        acronym: '1CIA',
      },
    });
    expect(setCookieHeader).toContain('sigat_session=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('Path=/');
    expect(setCookieHeader).toContain('SameSite=Lax');
    expect(setCookieHeader).not.toContain('Secure');
    expect(sessionId).toEqual(expect.any(String));
    expect(storedSession).toMatchObject({
      tokenDigest: digestSessionToken(sessionId as string),
      userId: response.body.userId,
      revokedAt: null,
    });
    expect(storedSession).not.toHaveProperty('sessionId');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: 'auth.login',
      userId: response.body.userId,
      result: 'success',
    });
  });

  it('marks the session cookie as secure when the app runs in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { createApp: createProductionApp } = await import('../app.js');

    await UserModel.create({
      name: 'Carlos Lima',
      registration: '54321',
      role: 'ditel_admin',
      active: true,
      unit: null,
      password: 'segredo-admin',
    });

    const response = await request(createProductionApp()).post('/api/v1/auth/login').send({
      registration: '54321',
      password: 'segredo-admin',
    });

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']?.[0]).toContain('Secure');
  });

  it('returns the same generic error for an unknown registration and a wrong password', async () => {
    await upsertUnit({
      id: 'unit-2',
      name: '2ª Companhia',
      acronym: '2CIA',
    });

    await UserModel.create({
      name: 'Bruna Nogueira',
      registration: '67890',
      role: 'unit_user',
      active: true,
      unit: {
        id: 'unit-2',
        name: '2ª Companhia',
        acronym: '2CIA',
      },
      password: 'senha-correta',
    });

    const [missingUserResponse, wrongPasswordResponse] = await Promise.all([
      request(createApp()).post('/api/v1/auth/login').send({
        registration: '00000',
        password: 'senha-errada',
      }),
      request(createApp()).post('/api/v1/auth/login').send({
        registration: '67890',
        password: 'senha-errada',
      }),
    ]);
    const auditEvents = await AuditEventModel.find().sort({ createdAt: 1 }).lean();

    expect(missingUserResponse.status).toBe(401);
    expect(wrongPasswordResponse.status).toBe(401);
    expect(missingUserResponse.body).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    });
    expect(wrongPasswordResponse.body).toEqual(missingUserResponse.body);
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents.map((event) => ({
      action: event.action,
      result: event.result,
      userId: event.userId,
    }))).toEqual(expect.arrayContaining([
      {
        action: 'auth.login',
        result: 'failure',
        userId: null,
      },
      {
        action: 'auth.login',
        result: 'failure',
        userId: expect.any(String),
      },
    ]));
  });

  it('runs bcrypt verification with the configured cost when the registration does not exist', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare');

    const response = await request(createApp()).post('/api/v1/auth/login').send({
      registration: 'matricula-inexistente',
      password: 'senha-qualquer',
    });
    const comparedHash = compareSpy.mock.calls[0]?.[1];

    expect(response.status).toBe(401);
    expect(compareSpy).toHaveBeenCalledOnce();
    expect(typeof comparedHash).toBe('string');
    expect(bcrypt.getRounds(comparedHash as string)).toBe(12);
  });

  it('rejects an inactive user with the same generic authentication error', async () => {
    await upsertUnit({
      id: 'unit-3',
      name: '3ª Companhia',
      acronym: '3CIA',
    });

    await UserModel.create({
      name: 'Diego Silva',
      registration: '99999',
      role: 'unit_user',
      active: false,
      unit: {
        id: 'unit-3',
        name: '3ª Companhia',
        acronym: '3CIA',
      },
      password: 'senha-bloqueada',
    });

    const response = await request(createApp()).post('/api/v1/auth/login').send({
      registration: '99999',
      password: 'senha-bloqueada',
    });
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.login' }).lean();

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    });
    expect(await SessionModel.countDocuments()).toBe(0);
    expect(auditEvent).toMatchObject({
      action: 'auth.login',
      result: 'failure',
    });
  });

  it('rejects a blocked user based on situation rather than a legacy active flag', async () => {
    await upsertUnit({
      id: 'unit-blocked',
      name: 'Unidade Bloqueada',
      acronym: 'UB',
    });

    await UserModel.create({
      name: 'Usuário bloqueado por situação',
      registration: '99998',
      role: 'unit_user',
      active: true,
      situation: 'blocked',
      unit: {
        id: 'unit-blocked',
        name: 'Unidade Bloqueada',
        acronym: 'UB',
      },
      password: 'senha-bloqueada',
    });

    const response = await request(createApp()).post('/api/v1/auth/login').send({
      registration: '99998',
      password: 'senha-bloqueada',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    });
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it.each([
    ['inactive', async () => {
      await upsertUnit({
        id: 'unit-canonical-check',
        name: 'Unidade Canônica',
        acronym: 'UC',
      }, false);
    }],
    ['missing', async () => {}],
  ])('rejects login when the authenticated unit is %s in the canonical registry', async (_state, arrangeUnit) => {
    await arrangeUnit();

    await UserModel.create({
      name: 'Usuária sem unidade canônica válida',
      registration: '99997',
      role: 'unit_user',
      active: true,
      situation: 'active',
      unit: {
        id: 'unit-canonical-check',
        name: 'Unidade adulterada',
        acronym: 'XXX',
      },
      password: 'senha-canonica',
    });

    const response = await request(createApp()).post('/api/v1/auth/login').send({
      registration: '99997',
      password: 'senha-canonica',
    });
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.login' }).lean();

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas.',
    });
    expect(await SessionModel.countDocuments()).toBe(0);
    expect(auditEvent).toMatchObject({
      action: 'auth.login',
      result: 'failure',
      userId: null,
    });
  });

  it('reads the current session from the persisted cookie', async () => {
    await upsertUnit({
      id: 'unit-4',
      name: '4ª Companhia',
      acronym: '4CIA',
    });

    await UserModel.create({
      name: 'Elisa Costa',
      registration: '11223',
      role: 'unit_user',
      active: true,
      unit: {
        id: 'unit-4',
        name: '4ª Companhia',
        acronym: '4CIA',
      },
      password: 'senha-elisa',
    });

    const agent = request.agent(createApp());
    const loginResponse = await agent.post('/api/v1/auth/login').send({
      registration: '11223',
      password: 'senha-elisa',
    });
    const sessionResponse = await agent.get('/api/v1/session');

    expect(loginResponse.status).toBe(200);
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body).toEqual(loginResponse.body);
  });

  it('returns exactly the public session contract without sensitive fields', async () => {
    await UserModel.create({
      name: 'Elisa Moura',
      registration: '11224',
      role: 'ditel_admin',
      active: true,
      unit: null,
      password: 'senha-elisa',
    });

    const agent = request.agent(createApp());
    await agent.post('/api/v1/auth/login').send({ registration: '11224', password: 'senha-elisa' });
    const response = await agent.get('/api/v1/session');

    expect(Object.keys(response.body).sort()).toEqual(['name', 'registration', 'role', 'unit', 'userId']);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|password|token|tokenDigest|sessionId/i);
  });

  it('changes the current user password only when mustChangePassword is true and returns an unlocked session', async () => {
    await UserModel.create({
      name: 'Usuário Resetado',
      registration: '55667',
      role: 'ditel_admin',
      active: true,
      unit: null,
      mustChangePassword: true,
      password: 'senha-temporaria',
    });

    const agent = request.agent(createApp());
    const loginResponse = await agent.post('/api/v1/auth/login').send({
      registration: '55667',
      password: 'senha-temporaria',
    });
    const response = await agent.post('/api/v1/auth/password-change').send({
      newPassword: 'nova-senha-segura',
    });
    const stored = await UserModel.findOne({ registration: '55667' }).select('+passwordHash mustChangePassword').lean().orFail();
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.credential_change' }).lean();

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.mustChangePassword).toBe(true);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: loginResponse.body.userId,
      name: 'Usuário Resetado',
      registration: '55667',
      role: 'ditel_admin',
      unit: null,
    });
    expect(stored.mustChangePassword).toBe(false);
    await expect(bcrypt.compare('nova-senha-segura', stored.passwordHash as string)).resolves.toBe(true);
    await expect(bcrypt.compare('senha-temporaria', stored.passwordHash as string)).resolves.toBe(false);
    expect(auditEvent).toMatchObject({
      action: 'auth.credential_change',
      userId: loginResponse.body.userId,
      result: 'success',
      before: { requiresCredentialChange: true },
      after: { requiresCredentialChange: false },
    });
    expect(JSON.stringify(auditEvent)).not.toMatch(/passwordHash|password|senha|token|tokenDigest|sessionId|nova-senha-segura|senha-temporaria/i);
  });

  it('blocks business and admin routes while mustChangePassword is true but allows session, logout, and password change', async () => {
    await upsertUnit({ id: 'unit-required-change', name: 'Unidade Troca', acronym: 'UTC' });
    await UserModel.create([
      {
        name: 'Admin Troca Obrigatória',
        registration: '55670',
        role: 'ditel_admin',
        active: true,
        unit: null,
        mustChangePassword: true,
        password: 'senha-temporaria',
      },
      {
        name: 'Unidade Troca Obrigatória',
        registration: '55671',
        role: 'unit_user',
        active: true,
        unit: { id: 'unit-required-change', name: 'Unidade Troca', acronym: 'UTC' },
        mustChangePassword: true,
        password: 'senha-temporaria',
      },
    ]);

    const adminAgent = request.agent(createApp());
    const adminLogin = await adminAgent.post('/api/v1/auth/login').send({ registration: '55670', password: 'senha-temporaria' });
    const adminSession = await adminAgent.get('/api/v1/session');
    const adminBlocked = await adminAgent.get('/api/v1/admin/users');
    const adminPasswordChange = await adminAgent.post('/api/v1/auth/password-change').send({ newPassword: 'nova-senha-admin' });

    const unitAgent = request.agent(createApp());
    const unitLogin = await unitAgent.post('/api/v1/auth/login').send({ registration: '55671', password: 'senha-temporaria' });
    const unitBlocked = await unitAgent.get('/api/v1/inventory');
    const unitLogout = await unitAgent.post('/api/v1/auth/logout');

    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.mustChangePassword).toBe(true);
    expect(adminSession.status).toBe(200);
    expect(adminSession.body.mustChangePassword).toBe(true);
    expect(adminBlocked.status).toBe(403);
    expect(adminBlocked.body).toEqual({
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Troca obrigatória de senha pendente.',
    });
    expect(adminPasswordChange.status).toBe(200);
    expect(adminPasswordChange.body).not.toHaveProperty('mustChangePassword');

    expect(unitLogin.status).toBe(200);
    expect(unitLogin.body.mustChangePassword).toBe(true);
    expect(unitBlocked.status).toBe(403);
    expect(unitBlocked.body).toEqual({
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Troca obrigatória de senha pendente.',
    });
    expect(unitLogout.status).toBe(204);
  });

  it('rolls back own password change when the success audit cannot be persisted', async () => {
    await UserModel.create({
      name: 'Audit Rollback',
      registration: '55672',
      role: 'ditel_admin',
      active: true,
      unit: null,
      mustChangePassword: true,
      password: 'senha-temporaria',
    });

    const agent = request.agent(createApp());
    const login = await agent.post('/api/v1/auth/login').send({ registration: '55672', password: 'senha-temporaria' });
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('simulated audit outage') as never);
    const response = await agent.post('/api/v1/auth/password-change').send({ newPassword: 'nova-senha-segura' });
    const stored = await UserModel.findOne({ registration: '55672' }).select('+passwordHash mustChangePassword').lean().orFail();

    expect(login.status).toBe(200);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ code: 'AUDIT_UNAVAILABLE', message: 'Não foi possível registrar auditoria.' });
    expect(stored.mustChangePassword).toBe(true);
    await expect(bcrypt.compare('senha-temporaria', stored.passwordHash as string)).resolves.toBe(true);
    await expect(bcrypt.compare('nova-senha-segura', stored.passwordHash as string)).resolves.toBe(false);
    expect(await AuditEventModel.countDocuments({ action: 'auth.credential_change' })).toBe(0);
  });

  it('rejects own password changes without a session, without the required flag, or with unsafe payloads', async () => {
    await UserModel.create({
      name: 'Usuário Normal',
      registration: '55668',
      role: 'ditel_admin',
      active: true,
      unit: null,
      password: 'senha-atual',
    });

    const noSession = await request(createApp()).post('/api/v1/auth/password-change').send({ newPassword: 'nova-senha-segura' });
    const agent = request.agent(createApp());
    const login = await agent.post('/api/v1/auth/login').send({ registration: '55668', password: 'senha-atual' });
    const notRequired = await agent.post('/api/v1/auth/password-change').send({ newPassword: 'nova-senha-segura' });
    const unsafe = await agent.post('/api/v1/auth/password-change').send({ newPassword: 'nova-senha-segura', passwordHash: 'hash-nao-aceito' });
    const short = await agent.post('/api/v1/auth/password-change').send({ newPassword: 'curta' });
    const stored = await UserModel.findOne({ registration: '55668' }).select('+passwordHash mustChangePassword').lean().orFail();

    expect(noSession.status).toBe(401);
    expect(login.status).toBe(200);
    expect(notRequired.status).toBe(409);
    expect(notRequired.body.code).toBe('PASSWORD_CHANGE_NOT_REQUIRED');
    expect(unsafe.status).toBe(400);
    expect(unsafe.body.code).toBe('INVALID_PASSWORD_CHANGE');
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('INVALID_PASSWORD_CHANGE');
    expect(stored.mustChangePassword ?? false).toBe(false);
    await expect(bcrypt.compare('senha-atual', stored.passwordHash as string)).resolves.toBe(true);
  });

  it('audits a session request without a cookie', async () => {
    const response = await request(createApp()).get('/api/v1/session');
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.session' }).lean();

    expect(response.status).toBe(401);
    expect(auditEvent).toMatchObject({
      action: 'auth.session',
      userId: null,
      result: 'failure',
      reason: 'missing_cookie',
    });
    expect(auditEvent).not.toHaveProperty('sessionId');
    expect(auditEvent).not.toHaveProperty('tokenDigest');
  });

  it('audits an invalid session cookie without persisting its token', async () => {
    const invalidToken = 'token-opaco-invalido';

    const response = await request(createApp())
      .get('/api/v1/session')
      .set('Cookie', `sigat_session=${invalidToken}`);
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.session' }).lean();

    expect(response.status).toBe(401);
    expect(auditEvent).toMatchObject({
      action: 'auth.session',
      userId: null,
      result: 'failure',
      reason: 'invalid_cookie',
    });
    expect(JSON.stringify(auditEvent)).not.toContain(invalidToken);
    expect(auditEvent).not.toHaveProperty('sessionId');
    expect(auditEvent).not.toHaveProperty('tokenDigest');
  });

  it('audits the session when the associated user was inactivated after login', async () => {
    await upsertUnit({
      id: 'unit-5',
      name: '5ª Companhia',
      acronym: '5CIA',
    });

    await UserModel.create({
      name: 'Gabriela Sousa',
      registration: '77889',
      role: 'unit_user',
      active: true,
      unit: {
        id: 'unit-5',
        name: '5ª Companhia',
        acronym: '5CIA',
      },
      password: 'senha-gabriela',
    });

    const agent = request.agent(createApp());
    const loginResponse = await agent.post('/api/v1/auth/login').send({
      registration: '77889',
      password: 'senha-gabriela',
    });
    const originalCookie = loginResponse.headers['set-cookie']?.[0];
    const sessionId = extractCookieValue(originalCookie, 'sigat_session');

    await UserModel.updateOne({ registration: '77889' }, { $set: { active: false } });

    const sessionResponse = await request(createApp())
      .get('/api/v1/session')
      .set('Cookie', originalCookie ?? '');
    const auditEvents = await AuditEventModel.find().sort({ createdAt: 1 }).lean();

    expect(loginResponse.status).toBe(200);
    expect(sessionResponse.status).toBe(401);
    expect(sessionResponse.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents.map((event) => ({
      action: event.action,
      result: event.result,
      reason: event.reason,
      userId: event.userId,
    }))).toEqual([
      {
        action: 'auth.login',
        result: 'success',
        reason: null,
        userId: expect.any(String),
      },
      {
        action: 'auth.session',
        result: 'failure',
        reason: 'inactive_user',
        userId: expect.any(String),
      },
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain(sessionId as string);
    expect(JSON.stringify(auditEvents)).not.toContain(digestSessionToken(sessionId as string));
  });

  it.each([
    ['inactive', async () => {
      await UnitModel.updateOne(
        { id: 'unit-session-canonical-check' },
        { $set: { active: false } },
      );
    }],
    ['missing', async () => {
      await UnitModel.deleteOne({ id: 'unit-session-canonical-check' });
    }],
  ])('audits the session when the user unit becomes %s in the canonical registry', async (_state, invalidateUnit) => {
    await upsertUnit({
      id: 'unit-session-canonical-check',
      name: 'Unidade Sessão',
      acronym: 'US',
    });

    await UserModel.create({
      name: 'Usuária de sessão',
      registration: '77888',
      role: 'unit_user',
      active: true,
      situation: 'active',
      unit: {
        id: 'unit-session-canonical-check',
        name: 'Unidade adulterada',
        acronym: 'XXX',
      },
      password: 'senha-sessao',
    });

    const agent = request.agent(createApp());
    const loginResponse = await agent.post('/api/v1/auth/login').send({
      registration: '77888',
      password: 'senha-sessao',
    });
    const originalCookie = loginResponse.headers['set-cookie']?.[0];
    const sessionId = extractCookieValue(originalCookie, 'sigat_session');

    expect(loginResponse.status).toBe(200);

    await invalidateUnit();

    const sessionResponse = await request(createApp())
      .get('/api/v1/session')
      .set('Cookie', originalCookie ?? '');
    const auditEvents = await AuditEventModel.find().sort({ createdAt: 1 }).lean();

    expect(sessionResponse.status).toBe(401);
    expect(sessionResponse.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents.map((event) => ({
      action: event.action,
      result: event.result,
      reason: event.reason,
      userId: event.userId,
    }))).toEqual([
      {
        action: 'auth.login',
        result: 'success',
        reason: null,
        userId: expect.any(String),
      },
      {
        action: 'auth.session',
        result: 'failure',
        reason: 'inactive_user',
        userId: expect.any(String),
      },
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain(sessionId as string);
    expect(JSON.stringify(auditEvents)).not.toContain(digestSessionToken(sessionId as string));
  });

  it('revokes the persisted session on logout and rejects the revoked cookie afterwards', async () => {
    await UserModel.create({
      name: 'Fabio Rocha',
      registration: '44556',
      role: 'ditel_admin',
      active: true,
      unit: null,
      password: 'senha-fabio',
    });

    const agent = request.agent(createApp());
    const loginResponse = await agent.post('/api/v1/auth/login').send({
      registration: '44556',
      password: 'senha-fabio',
    });
    const originalCookie = loginResponse.headers['set-cookie']?.[0];
    const sessionId = extractCookieValue(originalCookie, 'sigat_session');
    const logoutResponse = await agent.post('/api/v1/auth/logout');
    const revokedSessionResponse = await request(createApp())
      .get('/api/v1/session')
      .set('Cookie', originalCookie ?? '');
    const storedSession = sessionId
      ? await SessionModel.findOne({ tokenDigest: digestSessionToken(sessionId) }).lean()
      : null;
    const auditEvents = await AuditEventModel.find().sort({ createdAt: 1 }).lean();

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.text).toBe('');
    expect(logoutResponse.headers['set-cookie']?.[0]).toContain('sigat_session=');
    expect(logoutResponse.headers['set-cookie']?.[0]).toContain('Path=/');
    expect(logoutResponse.headers['set-cookie']?.[0]).toContain('Expires=');
    expect(revokedSessionResponse.status).toBe(401);
    expect(revokedSessionResponse.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
    expect(storedSession?.revokedAt).toEqual(expect.any(Date));
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents.map((event) => ({
      action: event.action,
      result: event.result,
      reason: event.reason,
      userId: event.userId,
    }))).toEqual([
      {
        action: 'auth.login',
        result: 'success',
        reason: null,
        userId: expect.any(String),
      },
      {
        action: 'auth.logout',
        result: 'success',
        reason: null,
        userId: expect.any(String),
      },
      {
        action: 'auth.session',
        result: 'failure',
        reason: 'revoked_session',
        userId: expect.any(String),
      },
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain(sessionId as string);
    expect(JSON.stringify(auditEvents)).not.toContain(digestSessionToken(sessionId as string));
  });
});
