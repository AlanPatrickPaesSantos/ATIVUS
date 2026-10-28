import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EquipmentModel } from './Equipment.js';

describe('generated PMPA equipment compatibility', () => {
  it('validates every generated artifact with the real Equipment model', () => {
    const artifactPath = resolve(process.cwd(), '../docs/catalog/generated-equipment/equipment.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as { equipment: Record<string, unknown>[] };
    expect(artifact.equipment).toHaveLength(1151);
    for (const item of artifact.equipment) {
      expect(new EquipmentModel(item).validateSync()).toBeUndefined();
      expect(item.provenance).toMatchObject({ synthetic: true });
    }
  });
});
