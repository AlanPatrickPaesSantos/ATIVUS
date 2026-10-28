import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const GENERATOR_NAME = 'ativus-pmpa-demonstrative-equipment'
export const GENERATOR_VERSION = '1.0.0'
export const DEFAULT_SEED = 'ATIVUS-PMPA-DEMO-2026-10-27'
export const CATALOG_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/catalog/pmpa-organizational-catalog.v1.normalized.json')
export const DEFAULT_OUTPUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/catalog/generated-equipment')
export const CONFIG_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './pmpa-equipment-generator.config.json')

const VALID_UNIT_TYPES = new Set(['BPM', 'CIPM', 'SPECIALIZED', 'CIME', 'CIPAMB'])
const VALID_SITUATIONS = ['active', 'maintenance', 'inactive', 'lost', 'written_off']
const CATEGORY_DEFINITIONS = {
  radio: { type: 'Rádio comunicador', category: 'Comunicação', models: ['ATV-RD-100', 'ATV-RD-200', 'ATV-RD-300'], brands: ['Marca Fictícia Rádio'] },
  computer: { type: 'Computador', category: 'Informática', models: ['ATV-PC-100', 'ATV-PC-200'], brands: ['Marca Fictícia Informática'] },
  monitor: { type: 'Monitor', category: 'Informática', models: ['ATV-MON-100', 'ATV-MON-200'], brands: ['Marca Fictícia Informática'] },
  network_switch: { type: 'Switch de rede', category: 'Rede', models: ['ATV-SW-100', 'ATV-SW-200'], brands: ['Marca Fictícia Rede'] },
  access_point: { type: 'Ponto de acesso Wi-Fi', category: 'Rede', models: ['ATV-AP-100', 'ATV-AP-200'], brands: ['Marca Fictícia Rede'] },
  ups: { type: 'Nobreak', category: 'Energia', models: ['ATV-NB-100', 'ATV-NB-200'], brands: ['Marca Fictícia Energia'] },
  desk: { type: 'Mesa de escritório', category: 'Mobiliário', models: ['ATV-MESA-100'], brands: ['Marca Fictícia Mobiliário'] },
  chair: { type: 'Cadeira de escritório', category: 'Mobiliário', models: ['ATV-CADEIRA-100', 'ATV-CADEIRA-200'], brands: ['Marca Fictícia Mobiliário'] },
}
const DEMONSTRATIVE_SITUATIONS = ['active', 'active', 'active', 'active', 'active', 'active', 'active', 'maintenance', 'maintenance', 'inactive', 'lost', 'written_off']
const DEFAULT_QUANTITIES = {
  BPM: { radio: 3, computer: 2, monitor: 2, network_switch: 1, access_point: 1, ups: 1, desk: 2, chair: 3 },
  CIPM: { radio: 2, computer: 1, monitor: 1, network_switch: 1, access_point: 1, ups: 1, desk: 1, chair: 2 },
  SPECIALIZED: { radio: 3, computer: 2, monitor: 2, network_switch: 1, access_point: 2, ups: 1, desk: 2, chair: 3 },
  CIME: { radio: 3, computer: 3, monitor: 2, network_switch: 1, access_point: 1, ups: 1, desk: 2, chair: 3 },
  CIPAMB: { radio: 2, computer: 1, monitor: 1, network_switch: 1, access_point: 1, ups: 1, desk: 1, chair: 2 },
}
const DEFAULT_CONFIG_VALUES = {
  eligibleUnitTypes: ['BPM', 'CIPM', 'SPECIALIZED', 'CIME', 'CIPAMB'],
  allowIntermediateUnitIds: [],
  rejectInvalidUnits: true,
  quantities: DEFAULT_QUANTITIES,
}

export const DEFAULT_CONFIG = {
  seed: DEFAULT_SEED,
  generatorVersion: GENERATOR_VERSION,
  config: DEFAULT_CONFIG_VALUES,
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

export function serializeCanonical(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableNumber(seed, unitId, category, index) {
  const digest = sha256(`${seed}|${unitId}|${category}|${index}`)
  return Number.parseInt(digest.slice(0, 8), 16)
}

function stableChoice(values, seed, unitId, category, index) {
  return values[stableNumber(seed, unitId, category, index) % values.length]
}

function hierarchyState(units, commands) {
  const byId = new Map(units.map((item) => [item.id, item]))
  const commandIds = new Set(commands.map((item) => item.id))
  const state = new Map()
  const visit = (unitId, trail = new Set()) => {
    if (state.has(unitId)) return state.get(unitId)
    if (trail.has(unitId)) return 'hierarchy_cycle'
    const current = byId.get(unitId)
    if (!current) return 'unit_not_found'
    const nextTrail = new Set(trail).add(unitId)
    if (current.parentUnitId) {
      const result = visit(current.parentUnitId, nextTrail)
      state.set(unitId, result)
      return result
    }
    if (current.parentCommandId !== null && current.parentCommandId !== undefined && !commandIds.has(current.parentCommandId)) {
      state.set(unitId, 'parent_command_not_found')
      return 'parent_command_not_found'
    }
    state.set(unitId, 'ok')
    return 'ok'
  }
  for (const item of units) visit(item.id)
  return state
}

function validateCatalogShape(catalog) {
  const units = catalog?.units
  const commands = [...(catalog?.commands ?? []), ...(catalog?.pendingCommands ?? [])]
  if (!Array.isArray(units) || !Array.isArray(catalog?.commands)) throw new Error('catalog_invalid_shape')
  const ids = new Set()
  const codes = new Set()
  for (const item of units) {
    if (!item.id || ids.has(item.id)) throw new Error(`duplicate_unit_id:${item.id ?? '(missing)'}`)
    if (!item.code || codes.has(item.code)) throw new Error(`duplicate_unit_code:${item.code ?? '(missing)'}`)
    ids.add(item.id)
    codes.add(item.code)
  }
  const commandIds = new Set()
  for (const command of commands) {
    if (!command.id || commandIds.has(command.id)) throw new Error(`duplicate_command_id:${command.id ?? '(missing)'}`)
    commandIds.add(command.id)
  }
  return { units, commands, commandIds }
}

function buildExclusion(unitId, code, reason) {
  return { unitId, code, reason }
}

function buildEquipment(unit, category, index, seed, generatorVersion, importBatchId) {
  const definition = CATEGORY_DEFINITIONS[category]
  if (!definition) throw new Error(`invalid_category:${category}`)
  const model = stableChoice(definition.models, seed, unit.id, category, index)
  const situation = stableChoice(DEMONSTRATIVE_SITUATIONS, seed, unit.id, category, index)
  const ordinal = String(index + 1).padStart(3, '0')
  const identity = `${unit.id}|${category}|${index}`
  const suffix = sha256(`${seed}|${identity}`).slice(0, 12).toUpperCase()
  return {
    id: `pmpa:equipment:${sha256(identity).slice(0, 24)}`,
    patrimony: `PMPA-DEMO-${suffix}`,
    type: definition.type,
    category: definition.category,
    model,
    brand: stableChoice(definition.brands, seed, unit.id, category, index),
    situation,
    location: `${unit.seatMunicipality ?? 'Sede demonstrativa'} — ambiente sintético ${ordinal}`,
    unit: { id: unit.id, name: unit.name, acronym: unit.acronym ?? unit.code },
    provenance: {
      synthetic: true,
      generator: GENERATOR_NAME,
      generatorVersion,
      importBatchId,
      source: 'PMPA catalog v1 demonstrative preview; not official property',
    },
  }
}

export function generateEquipmentArtifacts({ catalog, seed = DEFAULT_SEED, generatorVersion = GENERATOR_VERSION, config = DEFAULT_CONFIG_VALUES }) {
  const { units, commands, commandIds } = validateCatalogShape(catalog)
  const hierarchy = hierarchyState(units, commands)
  const effective = { ...DEFAULT_CONFIG_VALUES, ...config, quantities: { ...DEFAULT_QUANTITIES, ...(config.quantities ?? {}) } }
  const batchFingerprint = serializeCanonical({
    catalog,
    seed,
    generatorVersion,
    config: effective,
    categoryDefinitions: CATEGORY_DEFINITIONS,
    situations: DEMONSTRATIVE_SITUATIONS,
  })
  const importBatchId = `demo-${sha256(batchFingerprint).slice(0, 16)}`
  const equipment = []
  const exclusions = []
  const selected = [...units].sort((left, right) => left.id.localeCompare(right.id))

  for (const unit of selected) {
    const state = hierarchy.get(unit.id)
    const isIntermediate = commandIds.has(unit.id)
    let reason = null
    if (!unit.id || !unit.code) reason = 'missing_stable_identifier'
    else if (state === 'hierarchy_cycle') reason = state
    else if (state === 'parent_command_not_found') reason = state
    else if (state !== 'ok') reason = state ?? 'invalid_hierarchy'
    else if (unit.verificationStatus !== 'confirmed' || unit.activationStatus !== 'active') reason = 'verification_status_not_confirmed'
    else if (isIntermediate && !effective.allowIntermediateUnitIds.includes(unit.id)) reason = 'intermediate_command_not_explicitly_enabled'
    else if (!VALID_UNIT_TYPES.has(unit.type) || !effective.eligibleUnitTypes.includes(unit.type)) reason = 'unit_type_not_eligible'
    if (reason) {
      if (effective.rejectInvalidUnits && ['duplicate_unit_id', 'duplicate_unit_code', 'hierarchy_cycle', 'parent_command_not_found', 'unit_not_found'].includes(reason)) throw new Error(reason)
      exclusions.push(buildExclusion(unit.id ?? null, unit.code ?? null, reason))
      continue
    }
    const quantities = effective.quantities[unit.type] ?? {}
    for (const category of Object.keys(quantities).sort()) {
      const quantity = quantities[category]
      if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`invalid_quantity:${unit.type}:${category}`)
      for (let index = 0; index < quantity; index += 1) equipment.push(buildEquipment(unit, category, index, seed, generatorVersion, importBatchId))
    }
  }

  const ids = new Set()
  const patrimonies = new Set()
  for (const item of equipment) {
    if (ids.has(item.id)) throw new Error(`duplicate_equipment_id:${item.id}`)
    if (patrimonies.has(item.patrimony)) throw new Error(`duplicate_patrimony:${item.patrimony}`)
    ids.add(item.id)
    patrimonies.add(item.patrimony)
    if (!VALID_SITUATIONS.includes(item.situation)) throw new Error(`invalid_situation:${item.situation}`)
  }
  equipment.sort((left, right) => left.id.localeCompare(right.id))
  exclusions.sort((left, right) => `${left.unitId}|${left.reason}`.localeCompare(`${right.unitId}|${right.reason}`))
  const commandById = new Map(commands.map((command) => [command.id, command.acronym]))
  const byUnit = Object.fromEntries([...new Set(equipment.map((item) => item.unit.id))].sort().map((unitId) => [unitId, equipment.filter((item) => item.unit.id === unitId).length]))
  const byCommand = Object.fromEntries([...new Set(equipment.map((item) => commandById.get(units.find((unit) => unit.id === item.unit.id)?.parentCommandId) ?? 'SEM-COMANDO'))].sort().map((acronym) => [acronym, equipment.filter((item) => {
    const sourceUnit = units.find((unit) => unit.id === item.unit.id)
    return (commandById.get(sourceUnit?.parentCommandId) ?? 'SEM-COMANDO') === acronym
  }).length]))
  const summary = {
    catalogVersion: catalog.catalogVersion,
    eligibleUnitCount: new Set(equipment.map((item) => item.unit.id)).size,
    equipmentCount: equipment.length,
    byType: Object.fromEntries([...new Set(equipment.map((item) => item.type))].sort().map((type) => [type, equipment.filter((item) => item.type === type).length])),
    bySituation: Object.fromEntries(VALID_SITUATIONS.filter((situation) => equipment.some((item) => item.situation === situation)).map((situation) => [situation, equipment.filter((item) => item.situation === situation).length])),
    byCommand,
    byUnit,
    excludedUnitCount: exclusions.length,
  }
  const data = { schemaVersion: '1.0', generator: GENERATOR_NAME, generatorVersion, seed, importBatchId, equipment }
  const dataSerialized = serializeCanonical(data)
  const manifest = {
    schemaVersion: '1.0', generator: GENERATOR_NAME, generatorVersion, seed, importBatchId,
    equipmentCount: equipment.length, eligibleUnitCount: summary.eligibleUnitCount,
    dataSha256: sha256(dataSerialized),
  }
  return { equipment, summary, exclusions, manifest, dataSerialized }
}

export async function writeEquipmentArtifacts(outputDir, artifacts) {
  await fs.mkdir(outputDir, { recursive: true })
  const files = {
    'equipment.json': { schemaVersion: '1.0', generator: GENERATOR_NAME, generatorVersion: artifacts.manifest.generatorVersion, seed: artifacts.manifest.seed, importBatchId: artifacts.manifest.importBatchId, equipment: artifacts.equipment },
    'summary.json': artifacts.summary,
    'exclusions.json': { exclusions: artifacts.exclusions },
    'manifest.json': artifacts.manifest,
  }
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(outputDir, name), serializeCanonical(content), 'utf8')
  return Object.keys(files).map((name) => path.join(outputDir, name))
}

async function main() {
  const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT_DIR
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'))
  const configured = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'))
  const artifacts = generateEquipmentArtifacts({ catalog, ...DEFAULT_CONFIG, ...configured, config: { ...DEFAULT_CONFIG.config, ...(configured.config ?? {}) } })
  await writeEquipmentArtifacts(outputDir, artifacts)
  console.log(JSON.stringify({ outputDir, ...artifacts.manifest, ...artifacts.summary }, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
