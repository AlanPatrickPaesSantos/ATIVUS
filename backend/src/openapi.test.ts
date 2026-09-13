import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { TRIAGE_STATUSES } from './models/Call.js';

function pathBlock(schema: string, path: string): string {
  const start = schema.indexOf(`  ${path}:`);
  if (start === -1) return '';
  const nextPath = schema.indexOf('\n  /', start + 1);
  const components = schema.indexOf('\ncomponents:', start + 1);
  const end = [nextPath, components].filter((index) => index !== -1).sort((a, b) => a - b)[0] ?? schema.length;
  return schema.slice(start, end);
}

function operationBlock(path: string, method: 'get' | 'post' | 'patch', schema: string): string {
  const block = pathBlock(schema, path);
  const start = block.indexOf(`\n    ${method}:`);
  if (start === -1) return '';
  const nextOperation = block.slice(start + 1).search(/\n    [a-z]+:/);
  const end = nextOperation === -1 ? block.length : start + 1 + nextOperation;
  return block.slice(start, end);
}

describe('OpenAPI contract', () => {
  it('documents readiness and accepts category in EquipmentCreateRequest', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');

    expect(schema).toMatch(/\/readiness:/);
    expect(schema).toMatch(/EquipmentCreateRequest:[\s\S]*category:\s*\{ type: string \}/);
  });

  it('documents every backend call queue status returned after triage', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const callQueueItem = schema.match(/CallQueueItem:[\s\S]*?(?=\n    [A-Z][A-Za-z]+:|\n  securitySchemes:|$)/)?.[0] ?? '';

    expect(callQueueItem).toContain('status: { type: string, enum:');
    for (const status of ['Aberto', ...TRIAGE_STATUSES]) {
      expect(callQueueItem).toContain(status);
    }
  });

  it('documents 503 AUDIT_UNAVAILABLE for auditable mutation endpoints', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const auditableMutations = [
      ['post', '/admin/users'],
      ['patch', '/admin/users/{userId}'],
      ['post', '/admin/users/{userId}/password-reset'],
      ['post', '/auth/password-change'],
      ['patch', '/admin/users/{userId}/situation'],
      ['post', '/inventory'],
      ['post', '/calls'],
      ['patch', '/calls/{callId}/triage'],
      ['post', '/maintenance'],
      ['patch', '/maintenance/{maintenanceId}'],
      ['post', '/movements'],
      ['patch', '/movements/{id}/decision'],
    ] as const;

    for (const [method, path] of auditableMutations) {
      expect(operationBlock(path, method, schema), `${method.toUpperCase()} ${path}`).toContain(
        "'503': { $ref: '#/components/responses/AuditUnavailable' }",
      );
    }

    expect(schema).toContain('AuditUnavailable:');
    expect(schema).toContain('code: AUDIT_UNAVAILABLE');
    expect(schema).toContain('message: Não foi possível registrar auditoria.');
  });

  it('documents administrative password reset and the must-change-password login state', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const resetOperation = operationBlock('/admin/users/{userId}/password-reset', 'post', schema);
    const sessionContext = schema.match(/SessionContext:[\s\S]*?(?=\n    [A-Z][A-Za-z]+:|\n  securitySchemes:|$)/)?.[0] ?? '';

    expect(resetOperation).toContain('operationId: resetAdminUserPassword');
    expect(resetOperation).toContain("schema: { $ref: '#/components/schemas/AdminUserPasswordResetResponse' }");
    expect(resetOperation).not.toContain('requestBody:');
    expect(schema).toContain('AdminUserPasswordResetResponse:');
    expect(schema).toContain('temporaryPassword: { type: string, minLength: 20, writeOnly: true }');
    expect(sessionContext).toContain('mustChangePassword:');
  });

  it('documents administrative user edit with an updatedAt concurrency token and no secrets', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const operation = operationBlock('/admin/users/{userId}', 'patch', schema);
    const request = schema.match(/AdminUserUpdateRequest:[\s\S]*?(?=\n    [A-Z][A-Za-z]+:|\n  securitySchemes:|$)/)?.[0] ?? '';

    expect(operation).toContain('operationId: updateAdminUser');
    expect(operation).toContain("$ref: '#/components/schemas/AdminUserUpdateRequest'");
    expect(operation).toContain("'409': { $ref: '#/components/responses/Conflict' }");
    expect(request).toContain('required: [name, registration, role, unit, updatedAt]');
    expect(request).toContain('updatedAt: { type: string, format: date-time }');
    expect(request).not.toMatch(/passwordHash|password|senha|tokenDigest|sessionId/);
  });

  it('documents DITEL call triage with a closed concurrency-token payload and no secrets', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const operation = operationBlock('/calls/{callId}/triage', 'patch', schema);
    const request = schema.match(/TriageRequest:[\s\S]*?(?=\n    [A-Z][A-Za-z]+:|\n  securitySchemes:|$)/)?.[0] ?? '';

    expect(operation).toContain('operationId: triageCall');
    expect(operation).toContain('Exclusivo para administrador DITEL');
    expect(operation).toContain('updatedAt');
    expect(operation).toContain("'409': { $ref: '#/components/responses/Conflict' }");
    expect(request).toContain('required: [status, priority, section, updatedAt]');
    expect(request).toContain('additionalProperties: false');
    expect(request).toContain('updatedAt: { type: string, format: date-time }');
    expect(request).not.toMatch(/description|attachments|passwordHash|password|senha|token|tokenDigest|sessionId/);
  });

  it('documents scoped call details with public history and no secrets', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const operation = operationBlock('/calls/{callId}', 'get', schema);
    const details = schema.match(/CallDetails:[\s\S]*?(?=\n    [A-Z][A-Za-z]+:|\n  securitySchemes:|$)/)?.[0] ?? '';

    expect(operation).toContain('operationId: getCallDetails');
    expect(operation).toContain('DITEL');
    expect(operation).toContain("schema: { $ref: '#/components/schemas/CallDetails' }");
    expect(details).toContain('required: [id, protocol, problem, subject, description, unit, requestedBy, priority, status, section, equipment, openedAt, updatedAt, attachments, history]');
    expect(details).toContain('history: { type: array, items: { $ref:');
    expect(details).not.toMatch(/createdBy|updatedBy|passwordHash|password|senha|token|tokenDigest|sessionId|registration/);
  });

  it('documents every attachment download MIME accepted by upload flows', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const operation = operationBlock('/attachments/{attachmentId}/download', 'get', schema);

    for (const mime of [
      'application/octet-stream',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]) {
      expect(operation).toContain(mime);
    }
  });

  it('documents upload attachment arrays with the same five-file limit enforced by the API', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const equipmentRequest = schema.match(/EquipmentCreateRequest:[\s\S]*?(?=\n    [A-Z][A-Za-z]+:|\n  securitySchemes:|$)/)?.[0] ?? '';
    const callRequest = schema.match(/CallRequest:[\s\S]*?(?=\n    [A-Z][A-Za-z]+:|\n  securitySchemes:|$)/)?.[0] ?? '';

    expect(equipmentRequest).toContain('maxItems: 5');
    expect(callRequest).toContain('maxItems: 5');
  });

  it('documents own password change without accepting password hashes or tokens', async () => {
    const schema = await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8');
    const operation = operationBlock('/auth/password-change', 'post', schema);

    expect(operation).toContain('operationId: changeOwnPassword');
    expect(operation).toContain("schema: { $ref: '#/components/schemas/PasswordChangeRequest' }");
    expect(operation).toContain("schema: { $ref: '#/components/schemas/SessionContext' }");
    expect(schema).toContain('PasswordChangeRequest:');
    expect(schema).toContain('additionalProperties: false');
    expect(schema).toContain('newPassword: { type: string, minLength: 8, format: password, writeOnly: true }');
  });
});
