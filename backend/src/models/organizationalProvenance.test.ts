import { describe, expect, it } from 'vitest';

import {
  UnitModel,
  validateUnitHierarchy,
  type OrganizationalUnitInput,
} from './Unit.js';
import { EquipmentModel } from './Equipment.js';

const legacyUnit = { id: 'legacy-unit', name: 'Unidade Legada', acronym: 'LEG', active: true };

describe('organizational unit extension', () => {
  it('keeps legacy unit documents valid without organizational metadata', () => {
    const unit = new UnitModel(legacyUnit);
    expect(unit.validateSync()).toBeUndefined();
    expect(unit.toObject()).toMatchObject(legacyUnit);
  });

  it('accepts stable organizational metadata and validates a direct parent', () => {
    const unit = new UnitModel({
      ...legacyUnit,
      id: 'pmpa:unit:bpm-52',
      kind: 'bpm',
      parentUnitId: 'pmpa:command:cpr-viii',
      independent: false,
      seatMunicipality: 'Altamira',
      jurisdictionMunicipalities: ['Altamira'],
      verificationStatus: 'confirmed',
      sourceIds: ['decreto-1017-2025'],
      sourceDate: new Date('2025-10-20'),
      sourceReference: 'Art. 5, XLIV',
    });
    expect(unit.validateSync()).toBeUndefined();
    expect(unit.kind).toBe('bpm');
    expect(unit.parentUnitId).toBe('pmpa:command:cpr-viii');
  });

  it('rejects self-parenting and invalid organizational status', () => {
    const unit = new UnitModel({
      ...legacyUnit,
      id: 'pmpa:unit:bad',
      kind: 'unknown',
      parentUnitId: 'pmpa:unit:bad',
      verificationStatus: 'confirmed',
    });
    const error = unit.validateSync();
    expect(error?.errors.kind).toBeDefined();
    expect(error?.errors.parentUnitId).toBeDefined();
  });

  it('rejects missing parents and cycles before persistence', () => {
    const units: OrganizationalUnitInput[] = [
      { id: 'a', parentUnitId: 'b' },
      { id: 'b', parentUnitId: 'a' },
      { id: 'orphan', parentUnitId: 'missing' },
    ];
    expect(validateUnitHierarchy(units)).toEqual([
      'Unidade a referencia uma hierarquia cíclica.',
      'Unidade b referencia uma hierarquia cíclica.',
      'Unidade orphan referencia uma unidade superior inexistente: missing.',
    ]);
  });
});

describe('equipment provenance extension', () => {
  it('keeps legacy equipment valid and without provenance', () => {
    const equipment = new EquipmentModel({
      patrimony: 'LEGACY-PROVENANCE-001',
      type: 'Rádio',
      model: 'Modelo legado',
      brand: 'Marca',
      situation: 'active',
      location: 'Sala',
      unit: legacyUnit,
    });
    expect(equipment.validateSync()).toBeUndefined();
    expect(equipment.provenance).toBeUndefined();
  });

  it('accepts complete synthetic provenance without changing patrimony rules', () => {
    const equipment = new EquipmentModel({
      patrimony: 'DEMO-PROVENANCE-001',
      type: 'Rádio',
      model: 'Modelo demonstrativo',
      brand: 'Marca demonstrativa',
      situation: 'active',
      location: 'Demonstração',
      unit: legacyUnit,
      provenance: {
        synthetic: true,
        generator: 'ativus-pmpa-demo',
        generatorVersion: '1',
        importBatchId: 'demo-batch-001',
        source: 'demonstration',
      },
    });
    expect(equipment.validateSync()).toBeUndefined();
    expect(equipment.provenance?.synthetic).toBe(true);
  });

  it('rejects incomplete synthetic provenance', () => {
    const equipment = new EquipmentModel({
      patrimony: 'DEMO-PROVENANCE-002',
      type: 'Rádio',
      model: 'Modelo demonstrativo',
      brand: 'Marca demonstrativa',
      situation: 'active',
      location: 'Demonstração',
      unit: legacyUnit,
      provenance: { synthetic: true },
    });
    const error = equipment.validateSync();
    expect(error?.errors.provenance).toBeDefined();
  });
});
