import { describe, expect, it, vi } from 'vitest';

import { AuditEventModel } from '../models/AuditEvent.js';
import { ensureDemonstrativeUsersAuditCollection } from './pmpaDemonstrativeUsersRepository.js';

describe('demonstrative users audit preparation', () => {
  it('prepares the audit collection before opening the transaction', async () => {
    const createCollection = vi.spyOn(AuditEventModel, 'createCollection').mockResolvedValue(AuditEventModel as never);
    const createIndexes = vi.spyOn(AuditEventModel, 'createIndexes').mockResolvedValue([]);

    await ensureDemonstrativeUsersAuditCollection();

    expect(createCollection).toHaveBeenCalledOnce();
    expect(createIndexes).toHaveBeenCalledOnce();
    createCollection.mockRestore();
    createIndexes.mockRestore();
  });
});
