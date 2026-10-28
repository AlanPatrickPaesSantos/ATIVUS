import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildRollbackReport, writeRollbackAuditExport } from './pmpaImportCli.js';

describe('PMPA import rollback CLI reporting', () => {
  it('prints counts and outcomes without printing target IDs', () => {
    const report = buildRollbackReport({ mode: 'rollback-dry-run', batchId: 'demo-batch', blockers: ['rollback_dependency:user:u1'], conflicts: ['legacy_record'], equipmentToDelete: ['RP-1', 'RP-2'], unitsToDelete: ['unit-1'], result: null });
    expect(report).toEqual({ mode: 'rollback-dry-run', batchId: 'demo-batch', quantities: { equipment: 2, organizations: 1 }, blockers: ['rollback_dependency:user:u1'], conflicts: ['legacy_record'], result: 'preview_only' });
    expect(JSON.stringify(report)).not.toContain('RP-1');
    expect(JSON.stringify(report)).not.toContain('unit-1');
  });

  it('exports complete rollback targets only to an explicit JSON audit file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ativus-import-audit-'));
    const file = join(directory, 'rollback.json');
    await writeRollbackAuditExport(file, { batchId: 'demo-batch', equipmentToDelete: ['RP-1'], unitsToDelete: ['unit-1'] });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ batchId: 'demo-batch', equipmentToDelete: ['RP-1'], unitsToDelete: ['unit-1'] });
  });
});
