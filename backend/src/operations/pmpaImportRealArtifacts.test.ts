import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildImportPlan, type ImportArtifacts } from './pmpaImport.js';

describe('real PMPA import artifacts', () => {
  it('plans the complete eligible catalog without blockers and without persistence', () => {
    const root = resolve(process.cwd(), '..');
    const artifacts = {
      catalog: JSON.parse(readFileSync(resolve(root, 'docs/catalog/pmpa-organizational-catalog.v1.normalized.json'), 'utf8')),
      equipment: JSON.parse(readFileSync(resolve(root, 'docs/catalog/generated-equipment/equipment.json'), 'utf8')),
      manifest: JSON.parse(readFileSync(resolve(root, 'docs/catalog/generated-equipment/manifest.json'), 'utf8')),
    } as ImportArtifacts;
    const plan = buildImportPlan(artifacts, { units: [], equipment: [] });
    expect(plan.canApply).toBe(true);
    expect(plan.totals).toEqual({ commands: 20, units: 81, equipment: 1151 });
    expect(plan.organizationsToCreate).toHaveLength(101);
    expect(plan.equipmentToCreate).toHaveLength(1151);
  });
});
