import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATALOG_PATH,
  loadCatalog,
  validateCatalog,
  buildCatalogReport,
  renderCatalogReport,
} from './pmpa-catalog.mjs'

test('loads the versioned PMPA catalog with the expected official scope', async () => {
  const catalog = await loadCatalog(CATALOG_PATH)
  assert.equal(catalog.schemaVersion, '1.0')
  assert.equal(catalog.rawRecordCount, 88)
  assert.equal(catalog.commands.length, 20)
  assert.ok(catalog.units.length > 0)
  assert.ok(catalog.sources.some((source) => source.id === 'decreto-1017-2025'))
  assert.ok(catalog.sources.some((source) => source.id === 'orgaos-execucao-pmpa'))
})

test('validates identifiers, types, references, hierarchy and independent units', async () => {
  const catalog = await loadCatalog(CATALOG_PATH)
  const result = validateCatalog(catalog)
  assert.deepEqual(result.errors, [])
  assert.equal(new Set(catalog.commands.map((item) => item.id)).size, catalog.commands.length)
  assert.equal(new Set(catalog.units.map((item) => item.id)).size, catalog.units.length)
  assert.equal(new Set(catalog.units.map((item) => item.code)).size, catalog.units.length)
  assert.ok(catalog.units.some((item) => item.verificationStatus === 'pending'))
  assert.ok(catalog.units.every((item) => ['active', 'planned', 'pending'].includes(item.activationStatus)))
})

test('preserves unresolved records without assuming a superior command', async () => {
  const catalog = await loadCatalog(CATALOG_PATH)
  const pending = catalog.units.filter((item) => item.verificationStatus === 'pending')
  assert.ok(pending.length > 0)
  for (const unit of pending) {
    assert.equal(unit.parentCommandId, null)
    assert.ok(unit.sourceIds.length > 0)
    assert.ok(unit.note)
  }
})

test('reports command totals, divergences and pending records', async () => {
  const catalog = await loadCatalog(CATALOG_PATH)
  const report = buildCatalogReport(catalog)
  assert.equal(report.commandCount, 20)
  assert.equal(report.rawRecordCount, 88)
  assert.equal(report.uniqueUnitCount, catalog.units.length)
  assert.ok(report.divergenceCount > 0)
  assert.ok(report.pendingCount > 0)
  assert.equal(report.byCommand['CPR XIV'].listedUnits, 3)
})

test('documents organizational schema compatibility for the next phase', async () => {
  const catalog = await loadCatalog(CATALOG_PATH)
  const markdown = renderCatalogReport(catalog)
  assert.match(markdown, /Compatibilidade com registros legados/)
  assert.match(markdown, /parentUnitId/)
  assert.match(markdown, /provenance/)
  assert.match(markdown, /autoIndex/)
})

test('preserves officially confirmed acronyms for previously incomplete eligible units', async () => {
  const catalog = await loadCatalog(CATALOG_PATH)
  const expected = {
    'BPM-37': '37º BPM',
    'BPM-38': '38º BPM',
    'BPM-43': '43º BPM',
    'BPM-52': '52º BPM',
    'CIME-01': '1ª CIME',
    'CIME-02': '2ª CIME',
    'CIME-03': '3ª CIME',
  }
  for (const [code, acronym] of Object.entries(expected)) {
    const unit = catalog.units.find((item) => item.code === code)
    assert.equal(unit?.acronym, acronym)
    assert.ok(unit?.sourceIds.includes('bg-7-2025') || unit?.sourceIds.includes('bg-14-2025'))
  }
})
