import { describe, expect, it } from 'vitest';

import { AcReturnValidationError, AcReturnModel, fingerprintAcReturnRequest, validateAcReturnRequest } from './AcReturn.js';
import { PatrimonialOperationLockModel } from './PatrimonialOperationLock.js';

describe('AcReturn model contract', () => {
  it('validates the equipment identifier and optional reason', () => {
    expect(validateAcReturnRequest({ equipmentId: '507f1f77bcf86cd799439011', reason: '  Conferência  ' })).toEqual({ equipmentId: '507f1f77bcf86cd799439011', reason: 'Conferência' });
    expect(() => validateAcReturnRequest({ equipmentId: 'not-an-id' })).toThrow(AcReturnValidationError);
  });

  it('produces a stable fingerprint for the request payload', () => {
    const payload = { equipmentId: '507f1f77bcf86cd799439011', reason: 'Conferência' };
    expect(fingerprintAcReturnRequest(payload)).toBe(fingerprintAcReturnRequest({ ...payload }));
  });

  it('defines unique idempotency and equipment/status indexes', async () => {
    const indexes = AcReturnModel.schema.indexes();
    expect(indexes.find(([key]) => key.idempotencyKey === 1)?.[1]).toMatchObject({ unique: true });
    expect(indexes.some(([key]) => key.equipmentId === 1 && key.status === 1)).toBe(true);
  });

  it('defines an exclusive equipment operation lock', () => {
    const indexes = PatrimonialOperationLockModel.schema.indexes();
    expect(indexes.find(([key]) => key.equipmentId === 1)?.[1]).toMatchObject({ unique: true });
  });
});
