import { describe, expect, it } from 'vitest'

import {
  classifyIndexes,
  expectedIndexes,
  normalizeIndex,
  validateApplyArguments,
} from './index-safety.mjs'

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
})
