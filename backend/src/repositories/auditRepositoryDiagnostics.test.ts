import { describe, expect, it, vi } from 'vitest';

import { AuditEventModel } from '../models/AuditEvent.js';
import { UserModel } from '../models/User.js';
import { AuditPersistenceError, recordAuditEvent } from './auditRepository.js';

describe('audit persistence diagnostics', () => {
  it('preserves only a safe validation category and field', async () => {
    const validationError = Object.assign(new Error('passwordHash must not be exposed'), {
      name: 'ValidationError',
      errors: { result: { path: 'result', message: 'invalid result' } },
    });
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(validationError as never);

    await expect(recordAuditEvent({ action: 'pmpa-demonstrative-users.create', result: 'success' }))
      .rejects.toMatchObject({
        name: 'AuditPersistenceError',
        diagnosticCode: 'validation_failed',
        operation: 'audit.create',
        field: 'result',
      } satisfies Partial<AuditPersistenceError>);
  });

  it('classifies a namespace creation failure as unavailable collection', async () => {
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(Object.assign(new Error('Cannot create namespace in multi-document transaction'), { code: 263 }) as never);

    await expect(recordAuditEvent({ action: 'pmpa-demonstrative-users.create', result: 'success' }))
      .rejects.toMatchObject({
        diagnosticCode: 'collection_unavailable',
        operation: 'audit.create',
        field: null,
        mongoCode: 263,
      } satisfies Partial<AuditPersistenceError>);
  });

  it('preserves a TypeError class when the create result shape is invalid', async () => {
    vi.spyOn(AuditEventModel, 'create').mockResolvedValueOnce(undefined as never);

    await expect(recordAuditEvent({ action: 'pmpa-demonstrative-users.create', result: 'success' }))
      .rejects.toMatchObject({
        diagnosticCode: 'write_failed',
        operation: 'audit.create',
        errorName: 'TypeError',
        mongoCode: null,
      } satisfies Partial<AuditPersistenceError>);
  });

  it('unwraps only the safe code and class from a nested Mongo cause', async () => {
    const mongoCause = Object.assign(new Error('E11000 duplicate key error index: idempotencyKey_1 dup key'), { name: 'MongoServerError', code: 11000 });
    vi.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(Object.assign(new Error('wrapped write failure'), { name: 'MongooseError', cause: mongoCause }) as never);

    await expect(recordAuditEvent({ action: 'pmpa-demonstrative-users.create', result: 'success' }))
      .rejects.toMatchObject({
        diagnosticCode: 'duplicate_key',
        mongoCode: 11000,
        errorName: 'MongooseError',
        causeName: 'MongoServerError',
        indexName: 'idempotencyKey_1',
      } satisfies Partial<AuditPersistenceError>);
  });

  it('accepts the exact provisioner payload with Mongoose subdocuments', async () => {
    vi.restoreAllMocks();
    const user = new UserModel({
      name: 'Usuário de integração',
      registration: 'demo.integration.01',
      role: 'unit_user',
      situation: 'active',
      unit: { id: 'pmpa:integration:1', name: 'Unidade de integração 1', acronym: 'I1' },
      provisioning: { batchId: 'demo-users-integration-test', kind: 'pmpa-demonstrative-user' },
      passwordHash: '$2b$04$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const create = vi.spyOn(AuditEventModel, 'create').mockResolvedValueOnce([{
      toObject: () => ({ _id: 'audit-1', action: 'pmpa-demonstrative-users.create', module: 'administration', result: 'success' }),
    }] as never);

    await expect(recordAuditEvent({
      action: 'pmpa-demonstrative-users.create',
      module: 'administration',
      userId: String(user._id),
      actor: { id: 'pmpa-users-provisioner', name: 'Provisionador PMPA demonstrativo', role: 'ditel_admin' },
      entity: { type: 'user', id: String(user._id), label: user.registration },
      unit: user.unit,
      result: 'success',
      after: { registration: user.registration, role: user.role, provisioning: user.provisioning },
    })).resolves.toMatchObject({ id: 'audit-1' });
    expect(create).toHaveBeenCalledOnce();
  });
});
