export const TARGET_DATABASE = 'ativus'

export const expectedIndexes = [
  {
    collection: 'equipment',
    name: 'equipment_unit_situation',
    key: { 'unit.id': 1, situation: 1 },
    options: {},
  },
  {
    collection: 'equipment',
    name: 'equipment_patrimony_unique',
    key: { patrimony: 1 },
    options: { unique: true },
    duplicateField: 'patrimony',
  },
  {
    collection: 'actransfers',
    name: 'ac_transfer_material_equipment',
    key: { 'materials.equipmentId': 1 },
    options: {},
  },
  {
    collection: 'actransfers',
    name: 'ac_transfer_destination_date',
    key: { 'destinationUnit.id': 1, distributedAt: -1 },
    options: {},
  },
  {
    collection: 'actransfers',
    name: 'ac_transfer_idempotency_unique',
    key: { idempotencyKey: 1 },
    options: { unique: true },
    duplicateField: 'idempotencyKey',
  },
]

const comparableOptionNames = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
  'hidden',
]

function comparableOptions(index) {
  return Object.fromEntries(comparableOptionNames.map((name) => {
    const defaultValue = name === 'unique' || name === 'sparse' || name === 'hidden' ? false : null
    return [name, index[name] ?? index.options?.[name] ?? defaultValue]
  }))
}

export function normalizeIndex(index) {
  return {
    key: Object.entries(index.key ?? {}),
    options: comparableOptions(index),
  }
}

function sameNormalizedIndex(left, right) {
  return JSON.stringify(normalizeIndex(left)) === JSON.stringify(normalizeIndex(right))
}

function sameKey(left, right) {
  return JSON.stringify(Object.entries(left.key ?? {})) === JSON.stringify(Object.entries(right.key ?? {}))
}

export function classifyIndexes(expected, actual) {
  const present = []
  const missing = []
  const incompatible = []

  for (const expectedIndex of expected) {
    const sameKeyIndexes = actual.filter((actualIndex) => sameKey(expectedIndex, actualIndex))
    const exact = sameKeyIndexes.find((actualIndex) => sameNormalizedIndex(expectedIndex, actualIndex))

    if (exact) {
      present.push({ expected: expectedIndex, actual: exact })
    } else if (sameKeyIndexes.length > 0) {
      incompatible.push({ expected: expectedIndex, actual: sameKeyIndexes[0] })
    } else {
      missing.push(expectedIndex)
    }
  }

  return { present, missing, incompatible }
}

export function validateApplyArguments({ apply, backupConfirmed, restoreTested }) {
  if (!apply) return
  if (!backupConfirmed) {
    throw new Error('--apply exige --backup-confirmed.')
  }
  if (!restoreTested) {
    throw new Error('--apply exige --restore-tested.')
  }
}

export function duplicateChecksFor(missingIndexes, duplicateCounts) {
  return missingIndexes
    .filter((index) => index.options?.unique === true)
    .map((index) => ({ ...index, duplicateCount: duplicateCounts[index.name] ?? 0 }))
}
