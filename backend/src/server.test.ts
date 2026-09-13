import { describe, expect, it, vi, beforeEach } from 'vitest';

const { connectToDatabase } = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('./database/mongoose.js', () => ({
  connectToDatabase,
}));

import { startServer } from './server.js';

describe('startServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects to MongoDB before listening on the HTTP port', async () => {
    connectToDatabase.mockResolvedValue({} as never);
    const listen = vi.fn((port: number, callback?: () => void) => {
      callback?.();
      return { close: vi.fn() };
    });
    const logger = { log: vi.fn(), error: vi.fn() };

    await startServer({
      app: { listen } as never,
      port: 4310,
      connectionString: 'mongodb://127.0.0.1:27017/sigat-test',
      logger,
    });

    expect(connectToDatabase).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/sigat-test');
    expect(listen).toHaveBeenCalledWith(4310, expect.any(Function));
    expect(connectToDatabase.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
    expect(logger.log).toHaveBeenCalledWith('SIGAT backend listening on port 4310');
  });

  it('fails early and does not start listening when MongoDB connection setup fails', async () => {
    const failure = new Error('MONGODB_URI is required to connect to MongoDB');
    connectToDatabase.mockRejectedValue(failure);
    const listen = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };

    await expect(startServer({
      app: { listen } as never,
      port: 4310,
      connectionString: undefined,
      logger,
    })).rejects.toThrow('MONGODB_URI is required to connect to MongoDB');

    expect(listen).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });
});
