import { describe, expect, it } from 'vitest';

import { UserModel } from './User.js';

describe('demonstrative user provenance', () => {
  it('accepts optional provenance and never serializes a password hash', () => {
    const user = new UserModel({
      name: 'Usuário demonstrativo — Unidade',
      registration: 'demo.unit.example-abcd',
      role: 'unit_user',
      unit: { id: 'pmpa:unit:example', name: 'Unidade', acronym: 'UNI' },
      passwordHash: '$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu',
      mustChangePassword: true,
      provisioning: { batchId: 'demo-users-1234567890abcdef', kind: 'pmpa-demonstrative-user' },
    });

    expect(user.validateSync()).toBeUndefined();
    expect(user.provisioning?.batchId).toBe('demo-users-1234567890abcdef');
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
    expect(user.toJSON()).not.toHaveProperty('password');
  });

  it('rejects unsupported provisioning kinds', () => {
    const user = new UserModel({
      name: 'Usuário',
      registration: 'demo.unit.invalid-abcd',
      role: 'unit_user',
      unit: { id: 'pmpa:unit:invalid', name: 'Unidade', acronym: 'UNI' },
      passwordHash: '$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu',
      provisioning: { batchId: 'batch', kind: 'other' },
    });

    expect(user.validateSync()?.errors['provisioning.kind']).toBeDefined();
  });
});
