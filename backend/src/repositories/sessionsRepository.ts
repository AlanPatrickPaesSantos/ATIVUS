import { createHash, randomBytes } from 'node:crypto';
import type { ClientSession } from 'mongoose';

import { SessionModel } from '../models/Session.js';

export interface ActiveSession {
  id: string;
  userId: string;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredSession {
  id: string;
  userId: string;
  lastActivityAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
}

function digestSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
  options: {
    expiresAt: Date;
    lastActivityAt?: Date;
  },
): Promise<string> {
  const sessionId = randomBytes(32).toString('base64url');
  const lastActivityAt = options.lastActivityAt ?? new Date();

  await SessionModel.create({
    tokenDigest: digestSessionToken(sessionId),
    userId,
    lastActivityAt,
    expiresAt: options.expiresAt,
  });

  return sessionId;
}

export async function findSession(sessionId: string): Promise<ActiveSession | null> {
  const session = await findSessionRecord(sessionId);

  if (!session || session.revokedAt || !session.expiresAt) {
    return null;
  }

  return {
    ...session,
    lastActivityAt: session.lastActivityAt ?? session.updatedAt,
    expiresAt: session.expiresAt,
    revokedAt: null,
  };
}

export async function findSessionRecord(sessionId: string): Promise<StoredSession | null> {
  const session = await SessionModel.findOne({
    tokenDigest: digestSessionToken(sessionId),
  }).exec();

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    userId: session.userId,
    lastActivityAt: session.lastActivityAt ?? null,
    expiresAt: session.expiresAt ?? null,
    revokedAt: session.revokedAt ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export async function touchSession(sessionId: string, lastActivityAt: Date): Promise<void> {
  await SessionModel.updateOne(
    { tokenDigest: digestSessionToken(sessionId), revokedAt: null },
    { $set: { lastActivityAt } },
  ).exec();
}

export async function revokeSession(sessionId: string, revokedAt = new Date()): Promise<void> {
  await SessionModel.updateOne(
    { tokenDigest: digestSessionToken(sessionId), revokedAt: null },
    { $set: { revokedAt } },
  ).exec();
}

export async function revokeSessionsForUser(
  userId: string,
  revokedAt = new Date(),
  session?: ClientSession,
): Promise<number> {
  const result = await SessionModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt } },
    session ? { session } : undefined,
  ).exec();

  return result.modifiedCount;
}
