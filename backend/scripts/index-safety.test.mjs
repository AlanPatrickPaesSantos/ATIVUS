import { describe, expect, it } from 'vitest'

import {
  classifyIndexes,
  expectedIndexes,
  normalizeIndex,
  validateApplyArguments,
} from './index-safety.mjs'
import {
  assertTarget,
  buildMongoInvocation,
  formatReport,
} from './ensure-operational-indexes.mjs'

describe('index safety comparison', () => {
  it('requires exact key order and unique option for expected indexes', () => {
    const result = classifyIndexes(expectedIndexes, [
      { key: { 'unit.id': 1, situation: 1 }, name: 'unit.id_1_situation_1' },
      { key: { patrimony: 1 }, name: 'patrimony_1', unique: true },
    ])

    expect(result.present).toHaveLength(2)
    expect(result.missing).toHaveLength(3)
    expect(result.incompatible).toHaveLength(0)
  })

  it('does not treat a non-unique index as equivalent to a unique index', () => {
    const patrimony = expectedIndexes.find((index) => index.name === 'equipment_patrimony_unique')
    const result = classifyIndexes([patrimony], [
      { key: { patrimony: 1 }, name: 'patrimony_1', unique: false },
    ])

    expect(result.present).toHaveLength(0)
    expect(result.missing).toHaveLength(0)
    expect(result.incompatible).toEqual([{
      expected: patrimony,
      actual: { key: { patrimony: 1 }, name: 'patrimony_1', unique: false },
    }])
  })

  it('does not treat a differently ordered compound index as equivalent', () => {
    const expected = expectedIndexes.find((index) => index.name === 'equipment_unit_situation')
    const result = classifyIndexes([expected], [
      { key: { situation: 1, 'unit.id': 1 }, name: 'situation_1_unit.id_1' },
    ])

    expect(result.missing).toEqual([expected])
    expect(result.incompatible).toHaveLength(0)
  })

  it('normalizes only comparable index properties and ignores Mongo metadata', () => {
    expect(normalizeIndex({
      key: { idempotencyKey: 1 },
      name: 'idempotencyKey_1',
      unique: true,
      v: 2,
      ns: 'ativus.actransfers',
    })).toEqual({
      key: [['idempotencyKey', 1]],
      options: {
        unique: true,
        sparse: false,
        expireAfterSeconds: null,
        partialFilterExpression: null,
        collation: null,
        hidden: false,
      },
    })
  })

  it('requires both backup and restore confirmations before applying', () => {
    expect(() => validateApplyArguments({ apply: true, backupConfirmed: false, restoreTested: true }))
      .toThrow('backup')
    expect(() => validateApplyArguments({ apply: true, backupConfirmed: true, restoreTested: false }))
      .toThrow('restore-tested')
    expect(() => validateApplyArguments({ apply: false, backupConfirmed: false, restoreTested: false }))
      .not.toThrow()
  })

  it('starts mongosh without its implicit localhost connection', () => {
    const invocation = buildMongoInvocation('print("ok")', { MONGODB_URI: 'mongodb+srv://secret.example/ativus' })

    expect(invocation.command).toBe('mongosh')
    expect(invocation.args.slice(0, 2)).toEqual(['--nodb', '--quiet'])
    expect(invocation.args).not.toContain('mongodb+srv://secret.example/ativus')
    expect(invocation.options.shell).not.toBe(true)
    expect(invocation.options.env.MONGODB_URI).toBe('mongodb+srv://secret.example/ativus')
  })

  it('allows a missing actransfers collection in read-only mode', () => {
    expect(() => assertTarget({
      database: 'ativus',
      collections: { equipment: [], actransfers: null },
    }, { apply: false })).not.toThrow()
  })

  it('rejects applying when actransfers is absent without an approved collection procedure', () => {
    expect(() => assertTarget({
      database: 'ativus',
      collections: { equipment: [], actransfers: null },
    }, { apply: true })).toThrow('actransfers: coleção ausente')
  })

  it('reports correct, missing and conflicting indexes with the absent AC collection', () => {
    const comparison = classifyIndexes(expectedIndexes, [
      { key: { 'unit.id': 1, situation: 1 }, name: 'unit.id_1_situation_1' },
      { key: { patrimony: 1 }, name: 'patrimony_1', unique: true },
    ])
    const report = formatReport({
      database: 'ativus',
      collections: { equipment: [], actransfers: null },
    }, comparison)

    expect(report).toContain('actransfers: coleção ausente; índices pendentes')
    expect(report).toContain('Corretos: equipment_unit_situation, equipment_patrimony_unique')
    expect(report).toContain('Ausentes: ac_transfer_material_equipment, ac_transfer_destination_date, ac_transfer_idempotency_unique')
    expect(report).toContain('Conflitantes: nenhum')
  })
})
