import { createHash, randomBytes } from 'node:crypto';

import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { connectToDatabase, disconnectFromDatabase } from '../database/mongoose.js';
import { AuditEventModel } from '../models/AuditEvent.js';
import { LoginRateLimitCounterModel } from '../models/LoginRateLimitCounter.js';
import { SessionModel } from '../models/Session.js';
import { UnitModel } from '../models/Unit.js';
import { UserModel } from '../models/User.js';

const SECURITY_OPTIONS = {
  authSecurity: {
    loginRateLimit: {
      windowMs: 60_000,
      maxAttemptsPerIp: 2,
      maxAttemptsPerRegistration: 2,
    },
    originProtection: {
      allowedOrigins: ['https://sigat.local'],
    },
  },
} as const;

async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);

  await Promise.all(collections.map(async (collection) => collection.deleteMany({})));
}

function createSecuredApp() {
  return createApp({
    sessionCookieSecure: false,
    ...(SECURITY_OPTIONS as Record<string, unknown>),
  } as never);
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

async function seedUser(registration = 'secure-user', password = 'senha-segura') {
  await UnitModel.updateOne(
    { id: 'unit-secure' },
    {
      $set: {
        id: 'unit-secure',
        name: 'Unidade Segura',
        acronym: 'USEG',
        active: true,
      },
    },
    { upsert: true },
  );

  await UserModel.create({
    name: 'Usuária Segurança',
    registration,
    role: 'unit_user',
    active: true,
    unit: {
      id: 'unit-secure',
      name: 'Unidade Segura',
      acronym: 'USEG',
    },
    password,
  });
}

describe('auth security protections', () => {
  let mongoServer: MongoMemoryReplSet;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectToDatabase(mongoServer.getUri());
    await Promise.all([UserModel.init(), SessionModel.init(), AuditEventModel.init(), UnitModel.init(), LoginRateLimitCounterModel.init()]);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  });

  it('blocks login after repeated failed attempts from the same IP and registration', async () => {
    await seedUser();
    const app = createSecuredApp();

    await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-errada-1' });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-errada-2' });

    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-segura' });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Muitas tentativas de login. Tente novamente mais tarde.',
    });
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it('shares the login rate limit across app instances backed by the same database', async () => {
    await seedUser();
    const firstApp = createSecuredApp();
    const secondApp = createSecuredApp();

    await request(firstApp)
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-errada-1' });
    await request(firstApp)
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-errada-2' });

    const blocked = await request(secondApp)
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-segura' });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Muitas tentativas de login. Tente novamente mais tarde.',
    });
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it('allows at most two concurrent invalid logins across two app instances and rate-limits the rest', async () => {
    await seedUser();
    const firstApp = createSecuredApp();
    const secondApp = createSecuredApp();

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) => request(index % 2 === 0 ? firstApp : secondApp)
        .post('/api/v1/auth/login')
        .send({ registration: 'secure-user', password: `senha-errada-${index}` })),
    );
    const statuses = responses.map((response) => response.status);
    const unauthorizedCount = statuses.filter((status) => status === 401).length;
    const rateLimitedCount = statuses.filter((status) => status === 429).length;

    expect(unauthorizedCount).toBeLessThanOrEqual(2);
    expect(rateLimitedCount).toBeGreaterThanOrEqual(8);
    expect(statuses.every((status) => status === 401 || status === 429)).toBe(true);
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it('keeps the IP failure counter after a successful login for another registration', async () => {
    await seedUser('spray-a', 'senha-a');
    await seedUser('spray-b', 'senha-b');
    await seedUser('spray-valid', 'senha-valida');
    const app = createApp({
      sessionCookieSecure: false,
      authSecurity: {
        loginRateLimit: {
          windowMs: 60_000,
          maxAttemptsPerIp: 3,
          maxAttemptsPerRegistration: 10,
        },
      },
    });

    await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'spray-a', password: 'senha-errada-a' });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'spray-b', password: 'senha-errada-b' });
    const validLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'spray-valid', password: 'senha-valida' });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'spray-a', password: 'senha-errada-c' });

    const blockedByIp = await request(app)
      .post('/api/v1/auth/login')
      .send({ registration: 'spray-valid', password: 'senha-valida' });

    expect(validLogin.status).toBe(200);
    expect(blockedByIp.status).toBe(429);
    expect(blockedByIp.body).toEqual({
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Muitas tentativas de login. Tente novamente mais tarde.',
    });
  });

  it('rejects a legacy session document without expiresAt without exposing an internal error', async () => {
    await seedUser();
    const user = await UserModel.findOne({ registration: 'secure-user' }).lean().orFail();
    const legacySessionToken = randomBytes(32).toString('base64url');

    await SessionModel.collection.insertOne({
      tokenDigest: digestSessionToken(legacySessionToken),
      userId: String(user._id),
      revokedAt: null,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    const response = await request(createSecuredApp())
      .get('/api/v1/session')
      .set('Cookie', `sigat_session=${legacySessionToken}`);
    const storedSession = await SessionModel.findOne({ tokenDigest: digestSessionToken(legacySessionToken) }).lean();
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.session', reason: 'expired_session' }).lean();

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
    expect(storedSession?.revokedAt).toEqual(expect.any(Date));
    expect(auditEvent).toMatchObject({
      action: 'auth.session',
      result: 'failure',
      reason: 'expired_session',
      userId: String(user._id),
    });
    expect(JSON.stringify(auditEvent)).not.toContain(legacySessionToken);
    expect(JSON.stringify(auditEvent)).not.toContain(digestSessionToken(legacySessionToken));
  });

  it('rejects a session that exceeded the absolute lifetime', async () => {
    await seedUser();
    const agent = request.agent(createSecuredApp());
    const loginResponse = await agent
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-segura' });
    const sessionId = extractCookieValue(loginResponse.headers['set-cookie']?.[0], 'sigat_session');

    await SessionModel.collection.updateOne(
      { tokenDigest: digestSessionToken(sessionId as string) },
      {
        $set: {
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
          updatedAt: new Date('2020-01-01T00:00:00.000Z'),
          lastActivityAt: new Date('2020-01-01T00:00:00.000Z'),
          expiresAt: new Date('2020-01-01T00:01:00.000Z'),
        },
      },
    );

    const sessionResponse = await agent.get('/api/v1/session');
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.session', reason: 'expired_session' }).lean();

    expect(sessionResponse.status).toBe(401);
    expect(sessionResponse.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
    expect(auditEvent).toMatchObject({
      action: 'auth.session',
      result: 'failure',
      reason: 'expired_session',
    });
  });

  it('rejects a session that exceeded the inactivity timeout', async () => {
    await seedUser();
    const agent = request.agent(createSecuredApp());
    const loginResponse = await agent
      .post('/api/v1/auth/login')
      .send({ registration: 'secure-user', password: 'senha-segura' });
    const sessionId = extractCookieValue(loginResponse.headers['set-cookie']?.[0], 'sigat_session');

    await SessionModel.collection.updateOne(
      { tokenDigest: digestSessionToken(sessionId as string) },
      {
        $set: {
          createdAt: new Date(),
          updatedAt: new Date('2020-01-01T00:00:00.000Z'),
          lastActivityAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
    );

    const sessionResponse = await agent.get('/api/v1/session');
    const auditEvent = await AuditEventModel.findOne({ action: 'auth.session', reason: 'idle_timeout' }).lean();

    expect(sessionResponse.status).toBe(401);
    expect(sessionResponse.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sessão inválida ou expirada.',
    });
    expect(auditEvent).toMatchObject({
      action: 'auth.session',
      result: 'failure',
      reason: 'idle_timeout',
    });
  });

  it('rejects a state-changing request when the cookie is presented from a disallowed origin', async () => {
    await seedUser();
    const agent = request.agent(createSecuredApp());

    const loginResponse = await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'https://sigat.local')
      .send({ registration: 'secure-user', password: 'senha-segura' });
    expect(loginResponse.status).toBe(200);

    const logoutResponse = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example');
    const sessionResponse = await agent.get('/api/v1/session');

    expect(logoutResponse.status).toBe(403);
    expect(logoutResponse.body).toEqual({
      code: 'INVALID_ORIGIN',
      message: 'Origem da requisição não permitida.',
    });
    expect(sessionResponse.status).toBe(200);
  });
});
