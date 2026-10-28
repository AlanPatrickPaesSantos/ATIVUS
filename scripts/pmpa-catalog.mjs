import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CATALOG_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/catalog/pmpa-organizational-catalog.v1.json')
export const REPORT_PATH = path.resolve(path.dirname(CATALOG_PATH), 'pmpa-organizational-catalog.v1.md')
export const NORMALIZED_CATALOG_PATH = path.resolve(path.dirname(CATALOG_PATH), 'pmpa-organizational-catalog.v1.normalized.json')

const VALID_UNIT_TYPES = new Set(['BPM', 'CIPM', 'SPECIALIZED', 'CIME', 'CIPAMB'])
const VALID_STATUSES = new Set(['confirmed', 'divergent', 'pending'])
const VALID_ACTIVATION = new Set(['active', 'planned', 'pending'])
const SPECIAL_NAMES = {
  CIPOE: 'Companhia Independente de Policiamento Escolar',
  BPTUR: 'Batalhão de Policiamento Turístico',
  CIEPAS: 'Companhia Independente Especial de Polícia Assistencial',
  BPE: 'Batalhão de Policiamento Escolar',
  BPRV: 'Batalhão de Polícia Rodoviária',
  BPCHOQ: 'Batalhão de Polícia de Choque',
  BAC: 'Batalhão de Ações com Cães',
  BOPE: 'Batalhão de Operações Especiais',
  ROTAM: 'Batalhão de Rondas Ostensivas Táticas Motorizadas',
  BPA: 'Batalhão de Polícia Ambiental',
  CIPFLU: 'Companhia Independente de Polícia Fluvial',
  CIPAMB: 'Companhia Independente de Policiamento Ambiental',
}

function formatUnitName(code, type) {
  if (SPECIAL_NAMES[code]) return SPECIAL_NAMES[code]
  if (type === 'BPM') return `${Number(code)}º Batalhão de Polícia Militar`
  if (type === 'CIPM') return `${Number(code)}ª Companhia Independente de Polícia Militar`
  if (type === 'CIME') return `${Number(code.slice(-2))}ª Companhia Independente de Missões Especiais`
  if (type === 'CIPAMB') return `${Number(code.slice(-2))}ª Companhia Independente de Policiamento Ambiental`
  if (code.startsWith('BME-')) return `${Number(code.slice(-2))}º Batalhão de Missões Especiais`
  return code
}

function canonicalCode(rawCode, type) {
  if (type === 'BPM') return `BPM-${rawCode}`
  if (type === 'CIPM') return rawCode
  return rawCode
}

function sourceIdsForGroup(group) {
  return group.sourceIds ?? ['orgaos-execucao-pmpa']
}

function expandUnits(raw) {
  const byCode = new Map()
  const listedByCommand = new Map()

  const add = (candidate) => {
    const current = byCode.get(candidate.code)
    if (!current) {
      byCode.set(candidate.code, candidate)
      return
    }
    current.sourceIds = [...new Set([...current.sourceIds, ...candidate.sourceIds])]
    current.observedParentCommandIds = [...new Set([
      ...(current.observedParentCommandIds ?? (current.parentCommandId ? [current.parentCommandId] : [])),
      ...(candidate.parentCommandId ? [candidate.parentCommandId] : []),
    ])]
  }

  for (const group of raw.unitGroups) {
    const codes = [...group.codes, ...(group.extraCodes ?? [])]
    listedByCommand.set(group.commandId, codes.length)
    for (const rawCode of codes) {
      const type = rawCode.startsWith('CIPM-') ? 'CIPM'
        : rawCode.startsWith('CIME-') ? 'CIME'
          : rawCode.startsWith('CIPAMB-') ? 'CIPAMB'
            : rawCode.startsWith('BME-') ? 'SPECIALIZED'
            : group.type
      const code = type === 'CIPM' || type === 'CIME' || type === 'CIPAMB' ? rawCode : canonicalCode(rawCode, type)
      add({
        id: `pmpa:unit:${code.toLowerCase()}`,
        code,
        name: formatUnitName(type === 'BPM' ? rawCode : code.replace(/^CIPM-/, '').replace(/^CIME-/, '').replace(/^CIPAMB-/, ''), type),
        acronym: type === 'BPM' ? `${Number(rawCode)}º BPM` : type === 'CIPM' ? `${Number(rawCode.slice(-2))}ª CIPM` : code,
        type,
        parentCommandId: group.commandId,
        observedParentCommandIds: [group.commandId],
        seatMunicipality: null,
        activationStatus: 'active',
        verificationStatus: 'confirmed',
        independent: ['CIPM', 'CIME', 'CIPAMB'].includes(type),
        sourceIds: sourceIdsForGroup(group),
        note: null,
      })
    }
  }

  for (const unit of raw.additionalUnits) add({
    independent: ['CIPM', 'CIME', 'CIPAMB'].includes(unit.type),
    seatMunicipality: null,
    observedParentCommandIds: unit.parentCommandId ? [unit.parentCommandId] : [],
    note: null,
    ...unit,
    id: `pmpa:unit:${unit.code.toLowerCase()}`,
  })

  for (const [code, override] of Object.entries(raw.overrides)) {
    const unit = byCode.get(code)
    if (!unit) throw new Error(`Override sem unidade: ${code}`)
    Object.assign(unit, override)
    unit.sourceIds = [...new Set(unit.sourceIds)]
  }

  return { units: [...byCode.values()].sort((left, right) => left.code.localeCompare(right.code)), listedByCommand }
}

export async function loadCatalog(filePath = CATALOG_PATH) {
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'))
  const expanded = expandUnits(raw)
  return { ...raw, units: expanded.units, listedByCommand: Object.fromEntries(expanded.listedByCommand) }
}

function validateAcyclic(commands) {
  const commandIds = new Set(commands.map((item) => item.id))
  const errors = []
  for (const command of commands) {
    if (!command.parentCommandId) continue
    if (!commandIds.has(command.parentCommandId)) errors.push(`Comando superior inexistente: ${command.id}`)
    if (command.parentCommandId === command.id) errors.push(`Ciclo hierárquico: ${command.id}`)
  }
  return errors
}

export function validateCatalog(catalog) {
  const errors = []
  const commandIds = new Set(catalog.commands.map((item) => item.id))
  const sourceIds = new Set(catalog.sources.map((item) => item.id))
  const unitIds = new Set()
  const unitCodes = new Set()

  for (const command of [...catalog.commands, ...(catalog.pendingCommands ?? [])]) {
    if (!command.id || !command.name || !command.acronym) errors.push(`Comando incompleto: ${command.id ?? '(sem id)'}`)
    if (!VALID_STATUSES.has(command.verificationStatus)) errors.push(`Status de comando inválido: ${command.id}`)
    for (const sourceId of command.sourceIds ?? []) if (!sourceIds.has(sourceId)) errors.push(`Fonte inexistente em comando: ${command.id}`)
    if (command.verificationStatus === 'pending' && (command.parentCommandId || !command.note)) errors.push(`Comando pendente inconsistente: ${command.id}`)
  }

  errors.push(...validateAcyclic(catalog.commands))

  for (const unit of catalog.units) {
    if (unitIds.has(unit.id)) errors.push(`ID de unidade duplicado: ${unit.id}`)
    if (unitCodes.has(unit.code)) errors.push(`Código de unidade duplicado: ${unit.code}`)
    unitIds.add(unit.id)
    unitCodes.add(unit.code)
    if (!VALID_UNIT_TYPES.has(unit.type)) errors.push(`Tipo de unidade inválido: ${unit.code}`)
    if (!VALID_STATUSES.has(unit.verificationStatus)) errors.push(`Status de unidade inválido: ${unit.code}`)
    if (!VALID_ACTIVATION.has(unit.activationStatus)) errors.push(`Ativação inválida: ${unit.code}`)
    if (unit.parentCommandId !== null && !commandIds.has(unit.parentCommandId)) errors.push(`Comando superior inexistente: ${unit.code}`)
    for (const sourceId of unit.sourceIds ?? []) if (!sourceIds.has(sourceId)) errors.push(`Fonte inexistente em unidade: ${unit.code}`)
    if (!unit.sourceIds?.length) errors.push(`Unidade sem fonte: ${unit.code}`)
    if (unit.verificationStatus === 'pending' && (unit.parentCommandId !== null || !unit.note)) errors.push(`Unidade pendente inconsistente: ${unit.code}`)
  }

  return { errors }
}

export function buildCatalogReport(catalog) {
  const byCommand = {}
  for (const command of catalog.commands) {
    const listedUnits = Number(catalog.listedByCommand?.[command.id] ?? 0)
    const units = catalog.units.filter((unit) => unit.parentCommandId === command.id)
    byCommand[command.acronym] = {
      commandId: command.id,
      listedUnits,
      uniqueUnits: units.length,
      confirmedUnits: units.filter((unit) => unit.verificationStatus === 'confirmed').length,
      divergentUnits: units.filter((unit) => unit.verificationStatus === 'divergent').length,
      pendingUnits: units.filter((unit) => unit.verificationStatus === 'pending').length,
    }
  }
  return {
    catalogVersion: catalog.catalogVersion,
    commandCount: catalog.commands.length,
    pendingCommandCount: (catalog.pendingCommands ?? []).length,
    rawRecordCount: catalog.rawRecordCount,
    uniqueUnitCount: catalog.units.length,
    divergenceCount: catalog.units.filter((unit) => unit.verificationStatus === 'divergent').length,
    pendingCount: catalog.units.filter((unit) => unit.verificationStatus === 'pending').length,
    plannedCount: catalog.units.filter((unit) => unit.activationStatus === 'planned').length,
    byCommand,
  }
}

export function renderCatalogReport(catalog, report = buildCatalogReport(catalog)) {
  const lines = [
    '# Catálogo organizacional PMPA — ATIVUS',
    '',
    `Versão: ${report.catalogVersion}`,
    `Comandos confirmados no catálogo: ${report.commandCount}`,
    `Comandos pendentes: ${report.pendingCommandCount}`,
    `Registros brutos considerados: ${report.rawRecordCount}`,
    `Unidades únicas normalizadas: ${report.uniqueUnitCount}`,
    `Unidades divergentes: ${report.divergenceCount}`,
    `Unidades pendentes: ${report.pendingCount}`,
    '',
    '## Totais por comando',
    '',
    '| Comando | Registros observados | Unidades únicas | Confirmadas | Divergentes | Pendentes |',
    '|---|---:|---:|---:|---:|---:|',
  ]
  for (const [acronym, totals] of Object.entries(report.byCommand)) {
    lines.push(`| ${acronym} | ${totals.listedUnits} | ${totals.uniqueUnits} | ${totals.confirmedUnits} | ${totals.divergentUnits} | ${totals.pendingUnits} |`)
  }
  lines.push('', '## Pendências e divergências', '')
  for (const unit of catalog.units.filter((item) => item.verificationStatus !== 'confirmed')) {
    lines.push(`- **${unit.code}** — ${unit.verificationStatus}: ${unit.note}`)
  }
  for (const command of catalog.pendingCommands ?? []) lines.push(`- **${command.acronym}** — comando pendente: ${command.note}`)
  lines.push(
    '',
    '## Compatibilidade com registros legados',
    '',
    '- Os campos atuais `id`, `name`, `acronym`, `active` e timestamps permanecem preservados.',
    '- `parentUnitId`, `kind`, `verificationStatus` e fontes são metadados opcionais; registros antigos continuam válidos.',
    '- Equipamentos e usuários continuam usando snapshots de unidade; a hierarquia não reescreve históricos.',
    '- A proveniência demonstrativa fica em `Equipment.provenance` e não é necessária para equipamentos legados.',
    '- `importBatchId` identifica exclusivamente uma futura importação e não autoriza exclusão ampla.',
    '- O bootstrap de produção deve usar `autoIndex: false` e criar índices somente por migração controlada; esta fase não altera essa configuração.',
    '- `validateUnitHierarchy()` deve ser chamada obrigatoriamente antes de qualquer futura importação ou atualização hierárquica.',
  )
  lines.push('', '## Fontes', '')
  for (const source of catalog.sources) lines.push(`- [${source.title}](${source.url}) — ${source.date}`)
  return `${lines.join('\n')}\n`
}

export async function writeCatalogReport({ catalogPath = CATALOG_PATH, reportPath = REPORT_PATH, normalizedPath = NORMALIZED_CATALOG_PATH } = {}) {
  const catalog = await loadCatalog(catalogPath)
  const result = validateCatalog(catalog)
  if (result.errors.length) throw new Error(result.errors.join('\n'))
  const report = buildCatalogReport(catalog)
  await fs.writeFile(normalizedPath, `${JSON.stringify({
    schemaVersion: catalog.schemaVersion,
    catalogVersion: catalog.catalogVersion,
    jurisdiction: catalog.jurisdiction,
    rawRecordCount: catalog.rawRecordCount,
    sources: catalog.sources,
    commands: catalog.commands,
    pendingCommands: catalog.pendingCommands,
    units: catalog.units,
  }, null, 2)}\n`, 'utf8')
  await fs.writeFile(reportPath, renderCatalogReport(catalog, report), 'utf8')
  return report
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeCatalogReport()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
