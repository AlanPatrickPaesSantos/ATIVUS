import { describe, expect, it } from 'vitest';

import { resolveAccessScopeFromContext } from '../auth/activeUnitScope.js';
import {
  AcTransferModel,
  classifyAcTransferReplay,
  fingerprintAcTransferPayload,
  validateAcTransferInput,
} from './AcTransfer.js';
import {
  EquipmentModel,
  isValidEquipmentCustody,
  type EquipmentCustody,
} from './Equipment.js';
import { assertValidUserRoleUnit, UserModel } from './User.js';

const destination = { id: 'unit-2', name: '2º BPM', acronym: '2BPM' };

describe('AC phase one domain contracts', () => {
  it('accepts an AC operator without a unit and rejects a unit assignment', () => {
    expect(() => assertValidUserRoleUnit('ac_operator', null)).not.toThrow();
    expect(() => assertValidUserRoleUnit('ac_operator', destination)).toThrow();

    const user = new UserModel({
      name: 'Operador AC',
      registration: '300001',
      role: 'ac_operator',
      unit: null,
      passwordHash: '$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu',
    });

    expect(user.validateSync()).not.toBeTruthy();
  });

  it('does not expose traditional unit or statewide scope to an AC operator', async () => {
    await expect(resolveAccessScopeFromContext({ role: 'ac_operator', unit: null })).resolves.toBeNull();
  });

  it('models explicit AC and unit custody while keeping the legacy unit field', () => {
    const acCustody: EquipmentCustody = { scope: 'AC', unit: null };
    const unitCustody: EquipmentCustody = { scope: 'UNIT', unit: destination };

    expect(EquipmentModel.schema.path('custody.scope')).toBeDefined();
    expect(EquipmentModel.schema.path('custody.unit')).toBeDefined();
    expect(acCustody).toEqual({ scope: 'AC', unit: null });
    expect(unitCustody.unit?.id).toBe('unit-2');
    expect(EquipmentModel.schema.path('unit')).toBeDefined();
    expect(isValidEquipmentCustody(acCustody)).toBe(true);
    expect(isValidEquipmentCustody({ scope: 'AC', unit: destination })).toBe(false);
    expect(isValidEquipmentCustody({ scope: 'UNIT', unit: null })).toBe(false);
  });

  it('requires Equipment.unit to agree with custody while preserving valid legacy documents', () => {
    const ac = new EquipmentModel({
      patrimony: 'AC-001', type: 'Rádio', model: 'X', brand: 'B', situation: 'active', location: 'AC', unit: null,
      custody: { scope: 'AC', unit: null },
    });
    expect(ac.validateSync()).toBeUndefined();

    const mismatchedUnit = new EquipmentModel({
      patrimony: 'UNIT-001', type: 'Rádio', model: 'X', brand: 'B', situation: 'active', location: 'Sala', unit: destination,
      custody: { scope: 'UNIT', unit: { ...destination, id: 'unit-other' } },
    });
    expect(mismatchedUnit.validateSync()).toBeTruthy();

    const legacy = new EquipmentModel({
      patrimony: 'LEGACY-001', type: 'Rádio', model: 'X', brand: 'B', situation: 'active', location: 'Sala', unit: destination,
    });
    expect(legacy.validateSync()).toBeUndefined();
  });

  it('defines a confirmed multi-material transfer with immutable AC origin', () => {
    expect(AcTransferModel.schema.path('origin')).toBeDefined();
    expect(AcTransferModel.schema.path('materials')).toBeDefined();
    expect(AcTransferModel.schema.path('destinationUnit')).toBeDefined();
    expect(AcTransferModel.schema.path('deliverer.name')).toBeDefined();
    expect(AcTransferModel.schema.path('receiver.name')).toBeDefined();
    expect(AcTransferModel.schema.path('bg.number')).toBeDefined();
    expect(AcTransferModel.schema.path('fingerprint')).toBeDefined();
    expect(AcTransferModel.schema.path('idempotencyKey').options.immutable).toBe(true);
    expect(AcTransferModel.schema.path('materials.sourceCustody')).toBeDefined();

    const transfer = new AcTransferModel({
      origin: 'AC',
      destinationUnit: destination,
      distributedAt: new Date('2026-10-26T12:00:00.000Z'),
      deliverer: { name: 'Cb Entregador' },
      receiver: { name: 'Ten Recebedor' },
      materials: [{
        equipmentId: '507f1f77bcf86cd799439011',
        patrimony: 'RP-001',
        sourceCustody: { scope: 'AC', unit: null },
        equipmentUpdatedAt: '2026-10-26T11:00:00.000Z',
        equipmentVersion: 3,
      }],
      createdBy: 'ac-user-1',
      status: 'confirmed',
      idempotencyKey: 'ac-transfer-001',
      fingerprint: 'fingerprint-001',
    });

    expect(transfer.validateSync()).not.toBeTruthy();
    expect(transfer.origin).toBe('AC');
    expect(transfer.status).toBe('confirmed');
    expect(AcTransferModel.schema.indexes()).toContainEqual([{ idempotencyKey: 1 }, { background: true, unique: true }]);
    expect(EquipmentModel.schema.indexes().some(([keys, options]) => keys.serialNumber === 1 && options?.unique === true)).toBe(false);
  });

  it('rejects empty, duplicated or non-object-id materials before an atomic confirmation', () => {
    expect(() => validateAcTransferInput({
      destinationUnit: destination,
      distributedAt: '2026-10-26T12:00:00.000Z',
      deliverer: { name: 'Cb Entregador' },
      receiver: { name: 'Ten Recebedor' },
      materials: [],
    })).toThrow('Pelo menos um bem');

    expect(() => validateAcTransferInput({
      destinationUnit: destination,
      distributedAt: '2026-10-26T12:00:00.000Z',
      deliverer: { name: 'Cb Entregador' },
      receiver: { name: 'Ten Recebedor' },
      materials: [
        { equipmentId: '507f1f77bcf86cd799439011', patrimony: 'RP-001', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: '2026-10-26T11:00:00.000Z', equipmentVersion: 1 },
        { equipmentId: '507f1f77bcf86cd799439011', patrimony: 'RP-001', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: '2026-10-26T11:00:00.000Z', equipmentVersion: 1 },
      ],
    })).toThrow('não pode ser repetido');

    expect(() => validateAcTransferInput({
      destinationUnit: destination,
      distributedAt: '2026-10-26T12:00:00.000Z',
      deliverer: { name: 'Cb Entregador' },
      receiver: { name: 'Ten Recebedor' },
      materials: [{ equipmentId: 'invalid', patrimony: 'RP-001' }],
    })).toThrow('identificador do bem');
  });

  it('normalizes a valid transfer as immediately confirmed without a pending state', () => {
    const input = validateAcTransferInput({
      destinationUnit: destination,
      distributedAt: '2026-10-26T12:00:00.000Z',
      deliverer: { name: ' Cb Entregador ', registration: ' 123 ' },
      receiver: { name: ' Ten Recebedor ' },
      bg: { number: ' BG-42 ' },
      materials: [{
        equipmentId: '507f1f77bcf86cd799439011',
        patrimony: ' RP-001 ',
        serialNumber: ' SN-001 ',
        sourceCustody: { scope: 'AC', unit: null },
        equipmentUpdatedAt: '2026-10-26T11:00:00.000Z',
        equipmentVersion: 3,
      }],
    });

    expect(input).toMatchObject({
      origin: 'AC',
      status: 'confirmed',
      destinationUnit: destination,
      deliverer: { name: 'Cb Entregador', registration: '123' },
      receiver: { name: 'Ten Recebedor' },
      bg: { number: 'BG-42' },
      materials: [{ patrimony: 'RP-001', serialNumber: 'SN-001', sourceCustody: { scope: 'AC', unit: null }, equipmentVersion: 3 }],
    });

    const samePayload = validateAcTransferInput({
      ...input,
      materials: [...input.materials].reverse(),
    });
    expect(fingerprintAcTransferPayload(input)).toBe(fingerprintAcTransferPayload(samePayload));
    expect(classifyAcTransferReplay(fingerprintAcTransferPayload(input), fingerprintAcTransferPayload(samePayload))).toBe('replay');
    expect(classifyAcTransferReplay(fingerprintAcTransferPayload(input), 'different-fingerprint')).toBe('conflict');
  });
});
