import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  applyDemonstrativeUsersPlan,
  buildDemonstrativeUsersPlan,
  computeDemonstrativeUsersBatchId,
  buildAgeEncryptionArguments,
  encryptCredentialDelivery,
  prepareDemonstrativeUserPersistenceRecords,
  validateDemonstrativeUsersDestination,
  validatePersistedEligibleUnits,
  generateInitialPassword,
  type DemonstrativeUsersAdapter,
  type DemonstrativeCatalog,
  type ExistingDemonstrativeUser,
} from './pmpaDemonstrativeUsers.js';
import { UserModel } from '../models/User.js';
import { demonstrativeUserAuditIdempotencyKey } from '../repositories/pmpaDemonstrativeUsersRepository.js';

const eligible = Array.from({ length: 81 }, (_, index) => ({
  id: `pmpa:unit:${String(index + 1).padStart(2, '0')}`,
  name: `Unidade ${index + 1}`,
  acronym: `U${index + 1}`,
  verificationStatus: 'confirmed',
  activationStatus: 'active',
}));

const catalog: DemonstrativeCatalog = {
  catalogVersion: '2026-10-27',
  patrimonialImportBatchId: 'demo-0e66fd8f9f8078ab',
  units: [
    ...eligible,
    { id: 'pmpa:unit:pending', name: 'Pendente', acronym: 'PEN', verificationStatus: 'pending', activationStatus: 'pending' },
    { id: 'pmpa:unit:divergent', name: 'Divergente', acronym: 'DIV', verificationStatus: 'divergent', activationStatus: 'active' },
  ],
};

describe('demonstrative users planner', () => {
  it('plans exactly 81 eligible units with stable identities and no secrets', () => {
    const plan = buildDemonstrativeUsersPlan(catalog, []);

    expect(plan.canApply).toBe(true);
    expect(plan.creates).toHaveLength(81);
    expect(plan.creates.map((item) => item.unit.id)).toEqual([...eligible].sort((a, b) => a.id.localeCompare(b.id)).map((item) => item.id));
    expect(new Set(plan.creates.map((item) => item.registration)).size).toBe(81);
    expect(plan.creates.every((item) => item.registration.startsWith('demo.unit.'))).toBe(true);
    expect(plan.creates.every((item) => item.provisioning.kind === 'pmpa-demonstrative-user')).toBe(true);
    expect(plan.creates.every((item) => item.mustChangePassword)).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/passwordHash|senha|token/i);
    expect(plan.batchId).toBe(computeDemonstrativeUsersBatchId(catalog.catalogVersion, eligible.map((item) => item.id)));
  });

  it('matches the repository catalog eligible set exactly', async () => {
    const normalized = JSON.parse(await readFile(new URL('../../../docs/catalog/pmpa-organizational-catalog.v1.normalized.json', import.meta.url), 'utf8'));
    const catalogFromRepository: DemonstrativeCatalog = {
      catalogVersion: normalized.catalogVersion,
      patrimonialImportBatchId: 'demo-0e66fd8f9f8078ab',
      units: normalized.units,
    };
    const eligibleIds = normalized.units
      .filter((unit: { verificationStatus: string; activationStatus: string }) => unit.verificationStatus === 'confirmed' && unit.activationStatus === 'active')
      .map((unit: { id: string }) => unit.id)
      .sort();
    const plan = buildDemonstrativeUsersPlan(catalogFromRepository, []);

    expect(eligibleIds).toHaveLength(81);
    expect(plan.creates.map((item) => item.unit.id)).toEqual(eligibleIds);
    expect(new Set(plan.creates.map((item) => item.registration))).toHaveLength(81);
  });

  it('blocks until every eligible catalog unit is present with canonical metadata', () => {
    expect(validatePersistedEligibleUnits(eligible, [])).toHaveLength(81);
    expect(validatePersistedEligibleUnits(eligible, eligible)).toEqual([]);
    expect(validatePersistedEligibleUnits(eligible, eligible.slice(0, 80))).toContain('unit_missing:pmpa:unit:81');
    expect(validatePersistedEligibleUnits(eligible, [{ ...eligible[0], name: 'Nome divergente' }, ...eligible.slice(1)])).toContain('unit_metadata_mismatch:pmpa:unit:01');
  });

  it('excludes commands, pending and divergent units', () => {
    const commandCatalog: DemonstrativeCatalog = {
      ...catalog,
      units: [{ id: 'pmpa:command:ditel', name: 'DITEL', acronym: 'DITEL', verificationStatus: 'confirmed', activationStatus: 'active', kind: 'intermediate_command' }, ...catalog.units],
    };

    const plan = buildDemonstrativeUsersPlan(commandCatalog, []);

    expect(plan.creates).toHaveLength(81);
    expect(plan.blockers).toEqual([]);
  });

  it('blocks a legacy registration collision and catalog changes', () => {
    const legacy: ExistingDemonstrativeUser = { registration: 'demo.unit.01-d9bd', role: 'ditel_admin', unitId: null, provisioningBatchId: null };
    const collisionPlan = buildDemonstrativeUsersPlan(catalog, [legacy]);
    expect(collisionPlan.canApply).toBe(false);
    expect(collisionPlan.conflicts).toContain('registration_conflict:demo.unit.01-d9bd');

    const altered = { ...catalog, units: catalog.units.filter((item) => item.id !== eligible[0].id) };
    const alteredPlan = buildDemonstrativeUsersPlan(altered, []);
    expect(alteredPlan.canApply).toBe(false);
    expect(alteredPlan.blockers).toContain('eligible_unit_count_mismatch:expected_81:actual_80');
  });

  it('recognizes only same-batch same-unit users as existing and never regenerates them', () => {
    const first = buildDemonstrativeUsersPlan(catalog, []);
    const existing: ExistingDemonstrativeUser[] = first.creates.slice(0, 1).map((item) => ({
      registration: item.registration,
      role: 'unit_user',
      unitId: item.unit.id,
      provisioningBatchId: first.batchId,
    }));
    const plan = buildDemonstrativeUsersPlan(catalog, existing);

    expect(plan.existing).toHaveLength(1);
    expect(plan.creates).toHaveLength(80);
    expect(plan.conflicts).toEqual([]);
  });

  it('generates independent strong passwords and refuses apply without explicit safeguards', async () => {
    const firstPassword = generateInitialPassword();
    const secondPassword = generateInitialPassword();
    expect(firstPassword).toHaveLength(43);
    expect(secondPassword).toHaveLength(43);
    expect(secondPassword).not.toBe(firstPassword);

    const adapter: DemonstrativeUsersAdapter = { async transaction() { throw new Error('must not be called'); } };
    await expect(applyDemonstrativeUsersPlan(buildDemonstrativeUsersPlan(catalog, []), adapter, {
      authorized: false,
      backupConfirmed: false,
      backupId: undefined,
      destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
      confirmBatch: '',
      ageRecipient: 'age1example',
      credentialOutputPath: '/tmp/ativus-demo-credentials.age',
    })).rejects.toThrow('explicit_authorization_required');
  });

  it('uses age with a recipient and output file, without a shell or plaintext arguments', () => {
    const args = buildAgeEncryptionArguments('age1example', '/tmp/ativus-demo-credentials.age');
    expect(args).toEqual(['-r', 'age1example', '-o', '/tmp/ativus-demo-credentials.age']);
    expect(args.join(' ')).not.toContain('senha');
  });

  it('fails closed when the credential output target is not a writable file path', async () => {
    await expect(encryptCredentialDelivery('batch', [], 'age1example', '/tmp'))
      .rejects.toThrow('credential_output_not_available');
  });

  it('fails closed when the age executable cannot be started', async () => {
    await expect(encryptCredentialDelivery('batch', [], 'age1example', '/tmp/ativus-demo-age-failure.age', '__missing_age_for_test__'))
      .rejects.toThrow(/spawn __missing_age_for_test__ ENOENT/);
  });

  it('requires the approved local MongoDB endpoint with directConnection', () => {
    expect(validateDemonstrativeUsersDestination('mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0').valid).toBe(true);
    expect(validateDemonstrativeUsersDestination('mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true').valid).toBe(false);
    expect(validateDemonstrativeUsersDestination('mongodb://127.0.0.1:27018/ativus?directConnection=true').valid).toBe(false);
    expect(validateDemonstrativeUsersDestination('mongodb+srv://cluster.example/ativus_homolog?directConnection=true').valid).toBe(false);
  });

  it('reports a protected credential artifact when Mongo transaction fails', async () => {
    let transactionCalled = false;
    const adapter: DemonstrativeUsersAdapter = {
      async transaction() {
        transactionCalled = true;
        throw new Error('mongo_transaction_failed');
      },
    };

    await expect(applyDemonstrativeUsersPlan(buildDemonstrativeUsersPlan(catalog, []), adapter, {
      authorized: true,
      backupConfirmed: true,
      backupId: 'backup-1',
      destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
      confirmBatch: buildDemonstrativeUsersPlan(catalog, []).batchId,
      ageRecipient: 'age1example',
      credentialOutputPath: '/tmp/ativus-demo-credentials.age',
      deliverCredentials: async () => undefined,
      passwordHasher: async () => `$2b$12$${'a'.repeat(53)}`,
    })).rejects.toMatchObject({
      code: 'TRANSACTION_FAILED_AFTER_CREDENTIAL_ARTIFACT',
      credentialArtifactPath: '/tmp/ativus-demo-credentials.age',
    });
    expect(transactionCalled).toBe(true);
  });

  it('exposes only a sanitized technical category for persistence failures', async () => {
    const plan = buildDemonstrativeUsersPlan(catalog, []);
    const validationError = Object.assign(new Error('passwordHash validation details must not escape'), { name: 'ValidationError' });

    await expect(applyDemonstrativeUsersPlan(plan, {
      async transaction() { throw validationError; },
    }, {
      authorized: true,
      backupConfirmed: true,
      backupId: 'backup-1',
      destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
      confirmBatch: plan.batchId,
      ageRecipient: 'age1example',
      credentialOutputPath: '/tmp/ativus-demo-credentials.age',
      deliverCredentials: async () => undefined,
      passwordHasher: async () => `$2b$12$${'a'.repeat(53)}`,
    })).rejects.toMatchObject({
      code: 'TRANSACTION_FAILED_AFTER_CREDENTIAL_ARTIFACT',
      diagnosticCode: 'validation_failed',
    });
  });

  it('preserves a safe audit operation category without exposing the database error', async () => {
    const plan = buildDemonstrativeUsersPlan(catalog, []);

    await expect(applyDemonstrativeUsersPlan(plan, {
      async transaction() {
        throw Object.assign(new Error('namespace details must not escape'), {
          name: 'AuditPersistenceError',
          diagnosticCode: 'collection_unavailable',
          operation: 'audit.collection.prepare',
          field: null,
        });
      },
    }, {
      authorized: true,
      backupConfirmed: true,
      backupId: 'backup-1',
      destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
      confirmBatch: plan.batchId,
      ageRecipient: 'age1example',
      credentialOutputPath: '/tmp/ativus-demo-credentials.age',
      deliverCredentials: async () => undefined,
      passwordHasher: async () => `$2b$12$${'a'.repeat(53)}`,
    })).rejects.toMatchObject({
      diagnosticCode: 'audit_collection_unavailable',
      diagnosticOperation: 'audit.collection.prepare',
      diagnosticField: null,
    });
  });

  it('does not call delivery or Mongo when password generation fails', async () => {
    let delivered = false;
    let created = false;
    const plan = buildDemonstrativeUsersPlan(catalog, []);

    await expect(applyDemonstrativeUsersPlan(plan, {
      async transaction() { created = true; },
    }, {
      authorized: true,
      backupConfirmed: true,
      backupId: 'backup-1',
      destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
      confirmBatch: plan.batchId,
      ageRecipient: 'age1example',
      credentialOutputPath: '/tmp/ativus-demo-credentials.age',
      deliverCredentials: async () => { delivered = true; },
      passwordGenerator: () => { throw new Error('random_source_failed'); },
    })).rejects.toThrow('random_source_failed');
    expect(delivered).toBe(false);
    expect(created).toBe(false);
  });

  it('materializes the password hash before persistence instead of relying on bulk casting', async () => {
    const plan = buildDemonstrativeUsersPlan(catalog, []);
    const [prepared] = await prepareDemonstrativeUserPersistenceRecords([{
      ...plan.creates[0],
      password: 'independent-regression-password',
    }]);

    expect(prepared.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(prepared).not.toHaveProperty('password');
    expect(UserModel.castObject(prepared).passwordHash).toBe(prepared.passwordHash);
  });

  it('hashes before the transaction and emits only safe progress stages', async () => {
    const plan = buildDemonstrativeUsersPlan(catalog, []);
    const stages: string[] = [];
    let persisted: Array<Record<string, unknown>> = [];

    await applyDemonstrativeUsersPlan(plan, {
      async transaction(records) {
        stages.push('adapter_transaction');
        persisted = records as unknown as Array<Record<string, unknown>>;
      },
    }, {
      authorized: true,
      backupConfirmed: true,
      backupId: 'backup-1',
      destinationUri: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
      confirmBatch: plan.batchId,
      ageRecipient: 'age1example',
      credentialOutputPath: '/tmp/ativus-demo-credentials.age',
      deliverCredentials: async () => undefined,
      passwordGenerator: () => 'test-password-only-in-memory',
      passwordHasher: async () => `$2b$12$${'a'.repeat(53)}`,
      onProgress: (event) => stages.push(event.stage),
    });

    expect(stages).toEqual([
      'credentials_generated',
      'credentials_encrypted',
      'password_hashing_started',
      'password_hashing_completed',
      'transaction_started',
      'adapter_transaction',
      'transaction_completed',
    ]);
    expect(persisted).toHaveLength(81);
    expect(persisted[0]).not.toHaveProperty('password');
    expect(persisted[0].passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('assigns a stable unique idempotency key to each demonstrative audit event', () => {
    expect(demonstrativeUserAuditIdempotencyKey('demo-users-batch', 'demo.unit.alpha-1234'))
      .toBe('pmpa-demonstrative-users.create:demo-users-batch:demo.unit.alpha-1234');
    expect(demonstrativeUserAuditIdempotencyKey('demo-users-batch', 'demo.unit.beta-5678'))
      .not.toBe(demonstrativeUserAuditIdempotencyKey('demo-users-batch', 'demo.unit.alpha-1234'));
  });
});
