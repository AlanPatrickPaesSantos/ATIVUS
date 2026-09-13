import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import multer from 'multer';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp, createErrorHandler } from './app.js';
import { connectToDatabase, disconnectFromDatabase } from './database/mongoose.js';

describe('health endpoint', () => {
  it('returns ok from GET /api/v1/health', async () => {
    const response = await request(createApp()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('readiness endpoint', () => {
  let mongoServer: MongoMemoryServer | null = null;

  afterAll(async () => {
    await disconnectFromDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('distinguishes API health from MongoDB readiness', async () => {
    const app = createApp();
    const notReady = await request(app).get('/api/v1/readiness');

    expect(notReady.status).toBe(503);
    expect(notReady.body).toEqual({
      status: 'not_ready',
      checks: {
        mongo: 'down',
      },
    });

    mongoServer = await MongoMemoryServer.create();
    await connectToDatabase(mongoServer.getUri());
    expect(mongoose.connection.readyState).toBe(1);

    const ready = await request(app).get('/api/v1/readiness');

    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({
      status: 'ok',
      checks: {
        mongo: 'up',
      },
    });
  });
});

describe('error handling', () => {
  it('returns the API error contract with status 400 for malformed JSON', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"registration":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'INVALID_JSON',
      message: 'Corpo JSON inválido.',
    });
  });

  it('returns a generic 500 response and logs the internal error', () => {
    const logger = { error: vi.fn() };
    const handler = createErrorHandler(logger);
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const response = { status, json } as never;
    const error = new Error('database exploded');

    handler(error, {} as never, response, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(logger.error).toHaveBeenCalledWith('Unhandled server error', error);
  });

  it('maps Multer file-size violations to the attachment size contract', () => {
    const logger = { error: vi.fn() };
    const handler = createErrorHandler(logger);
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const response = { status, json } as never;

    handler(new multer.MulterError('LIMIT_FILE_SIZE'), {} as never, response, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'ATTACHMENT_TOO_LARGE',
      message: 'Arquivo excede o tamanho máximo permitido.',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
