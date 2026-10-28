import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_CONFIG,
  generateEquipmentArtifacts,
  serializeCanonical,
} from './pmpa-equipment-generator.mjs'

const command = (id, acronym = 'CPR TEST') => ({ id, acronym, name: `Comando ${acronym}`, kind: 'intermediate_command', verificationStatus: 'confirmed' })
const unit = (id, code, parentCommandId, overrides = {}) => ({
  id, code, name: `${code} demonstrativo`, acronym: code,
  type: 'BPM', parentCommandId, activationStatus: 'active', verificationStatus: 'confirmed',
  independent: true, sourceIds: ['synthetic-test'], ...overrides,
})
const catalog = (units = [unit('pmpa:unit:bpm-01', 'BPM-01', 'pmpa:command:test')]) => ({
  schemaVersion: '1.0', catalogVersion: 'test', jurisdiction: 'PMPA', rawRecordCount: units.length,
  sources: [{ id: 'synthetic-test', title: 'Synthetic test fixture', date: '2026-10-27' }],
  commands: [command('pmpa:command:test')], pendingCommands: [], units,
})

test('generates byte-identical canonical artifacts for the same inputs', () => {
  const first = generateEquipmentArtifacts({ catalog: catalog(), ...DEFAULT_CONFIG })
  const second = generateEquipmentArtifacts({ catalog: catalog(), ...DEFAULT_CONFIG })
  assert.equal(serializeCanonical(first), serializeCanonical(second))
  assert.equal(first.manifest.importBatchId, second.manifest.importBatchId)
  assert.match(first.manifest.dataSha256, /^[a-f0-9]{64}$/)
  assert.equal(first.summary.byUnit['pmpa:unit:bpm-01'], first.equipment.length)
  assert.equal(first.summary.byCommand['CPR TEST'], first.equipment.length)
})

test('creates stable unique patrimony and equipment ids with complete synthetic provenance', () => {
  const result = generateEquipmentArtifacts({ catalog: catalog(), ...DEFAULT_CONFIG })
  assert.ok(result.equipment.length > 1)
  assert.equal(new Set(result.equipment.map((item) => item.id)).size, result.equipment.length)
  assert.equal(new Set(result.equipment.map((item) => item.patrimony)).size, result.equipment.length)
  for (const item of result.equipment) {
    assert.match(item.id, /^pmpa:equipment:/)
    assert.match(item.patrimony, /^PMPA-DEMO-/)
    assert.deepEqual(Object.keys(item.provenance).sort(), ['generator', 'generatorVersion', 'importBatchId', 'source', 'synthetic'])
    assert.equal(item.provenance.synthetic, true)
    assert.ok(['active', 'maintenance', 'inactive', 'lost', 'written_off'].includes(item.situation))
    assert.equal(item.unit.id, 'pmpa:unit:bpm-01')
  }
})

test('generates a broad representative catalog with active predominance', () => {
  const result = generateEquipmentArtifacts({
    catalog: catalog([
      unit('pmpa:unit:bpm-01', 'BPM-01', 'pmpa:command:test'),
      unit('pmpa:unit:cipm-01', 'CIPM-01', 'pmpa:command:test', { type: 'CIPM' }),
    ]),
    ...DEFAULT_CONFIG,
    config: {
      ...DEFAULT_CONFIG.config,
      quantities: {
        BPM: { radio: 3, computer: 2, monitor: 2, network_switch: 1, access_point: 1, ups: 1, desk: 2, chair: 3 },
        CIPM: { radio: 2, computer: 1, monitor: 1, network_switch: 1, access_point: 1, ups: 1, desk: 1, chair: 2 },
      },
    },
  })
  assert.ok(result.equipment.length >= 20)
  assert.ok(result.equipment.some((item) => item.category === 'Comunicação'))
  assert.ok(result.equipment.some((item) => item.category === 'Informática'))
  assert.ok(result.equipment.some((item) => item.category === 'Rede'))
  assert.ok(result.equipment.some((item) => item.category === 'Energia'))
  assert.ok(result.equipment.some((item) => item.category === 'Mobiliário'))
  assert.ok(result.summary.bySituation.active > result.summary.equipmentCount / 2)
  assert.deepEqual(Object.keys(result.summary.byType).sort(), ['Cadeira de escritório', 'Computador', 'Mesa de escritório', 'Monitor', 'Nobreak', 'Ponto de acesso Wi-Fi', 'Rádio comunicador', 'Switch de rede'])
})

test('derives a new import batch when generation configuration changes', () => {
  const first = generateEquipmentArtifacts({ catalog: catalog(), ...DEFAULT_CONFIG })
  const second = generateEquipmentArtifacts({
    catalog: catalog(), ...DEFAULT_CONFIG,
    config: { ...DEFAULT_CONFIG.config, quantities: { ...DEFAULT_CONFIG.config.quantities, BPM: { radio: 99 } } },
  })
  assert.notEqual(first.manifest.importBatchId, second.manifest.importBatchId)
})

test('derives a new import batch when catalog content changes', () => {
  const first = generateEquipmentArtifacts({ catalog: catalog(), ...DEFAULT_CONFIG })
  const second = generateEquipmentArtifacts({ catalog: { ...catalog(), units: [{ ...catalog().units[0], acronym: 'BPM-ALTERADO' }] }, ...DEFAULT_CONFIG })
  assert.notEqual(first.manifest.importBatchId, second.manifest.importBatchId)
})

test('excludes pending, divergent, orphaned and cyclic units with reasons', () => {
  const units = [
    unit('pmpa:unit:ok', 'BPM-OK', 'pmpa:command:test'),
    unit('pmpa:unit:divergent', 'BPM-DIV', 'pmpa:command:test', { verificationStatus: 'divergent' }),
    unit('pmpa:unit:pending', 'BPM-PEN', null, { verificationStatus: 'pending', parentCommandId: null }),
    unit('pmpa:unit:orphan', 'BPM-ORP', 'pmpa:command:missing'),
    unit('pmpa:unit:cycle', 'BPM-CYC', null, { parentUnitId: 'pmpa:unit:cycle' }),
  ]
  const result = generateEquipmentArtifacts({ catalog: catalog(units), ...DEFAULT_CONFIG, config: { ...DEFAULT_CONFIG.config, rejectInvalidUnits: false } })
  const excluded = new Map(result.exclusions.map((item) => [item.unitId, item.reason]))
  assert.ok(result.equipment.every((item) => item.unit.id === 'pmpa:unit:ok'))
  assert.equal(excluded.get('pmpa:unit:divergent'), 'verification_status_not_confirmed')
  assert.equal(excluded.get('pmpa:unit:pending'), 'verification_status_not_confirmed')
  assert.equal(excluded.get('pmpa:unit:orphan'), 'parent_command_not_found')
  assert.equal(excluded.get('pmpa:unit:cycle'), 'hierarchy_cycle')
})

test('does not generate for intermediate commands unless explicitly enabled', () => {
  const intermediate = unit('pmpa:command:test', 'CPR-TEST', null, { type: 'SPECIALIZED', independent: true })
  const defaultResult = generateEquipmentArtifacts({ catalog: catalog([intermediate]), ...DEFAULT_CONFIG })
  assert.equal(defaultResult.equipment.length, 0)
  const enabled = generateEquipmentArtifacts({
    catalog: catalog([intermediate]), ...DEFAULT_CONFIG,
    config: { ...DEFAULT_CONFIG.config, eligibleUnitTypes: ['SPECIALIZED'], allowIntermediateUnitIds: ['pmpa:command:test'] },
  })
  assert.ok(enabled.equipment.length > 0)
})

test('rejects duplicate stable ids and invalid hierarchy references', () => {
  assert.throws(() => generateEquipmentArtifacts({ catalog: catalog([
    unit('pmpa:unit:duplicate', 'BPM-01', 'pmpa:command:test'),
    unit('pmpa:unit:duplicate', 'BPM-02', 'pmpa:command:test'),
  ]), ...DEFAULT_CONFIG }), /duplicate_unit_id/)
  assert.throws(() => generateEquipmentArtifacts({ catalog: catalog([
    unit('pmpa:unit:bad', 'BPM-BAD', 'pmpa:command:missing'),
  ]), ...DEFAULT_CONFIG, config: { ...DEFAULT_CONFIG.config, rejectInvalidUnits: true } }), /parent_command_not_found/)
})
