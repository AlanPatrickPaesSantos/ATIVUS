#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

import {
  TARGET_DATABASE,
  classifyIndexes,
  duplicateChecksFor,
  expectedIndexes,
  validateApplyArguments,
} from './index-safety.mjs'

function parseArguments(argv) {
  return {
    apply: argv.includes('--apply'),
    backupConfirmed: argv.includes('--backup-confirmed'),
    restoreTested: argv.includes('--restore-tested'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function usage() {
  return [
    'Uso:',
    '  MONGODB_URI="$MONGODB_URI" node backend/scripts/ensure-operational-indexes.mjs',
    '  MONGODB_URI="$MONGODB_URI" node backend/scripts/ensure-operational-indexes.mjs --apply --backup-confirmed --restore-tested',
    '',
    'O modo padrão é read-only. --apply cria somente índices ausentes.',
    '--apply exige as confirmações explícitas --backup-confirmed e --restore-tested.',
    'A operação é recusada quando o banco conectado não se chama ativus.',
  ].join('\n')
}

function sanitizedError(output) {
  return output
    .replace(/mongodb(?:\+srv)?:\/\/[^\s'"`]+/gi, '[URI omitida]')
    .replace(/(password|passwd|pwd)=([^&\s]+)/gi, '$1=[omitido]')
    .trim()
}

function runMongoRead() {
  const script = `
const target = connect(process.env.MONGODB_URI)
const names = target.getCollectionNames()
const collections = {}
for (const name of ['equipment', 'actransfers']) {
  collections[name] = names.includes(name) ? target.getCollection(name).getIndexes() : null
}
const duplicateCounts = {}
for (const index of ${JSON.stringify(expectedIndexes)}) {
  if (index.options?.unique !== true || !collections[index.collection]) continue
  const duplicate = target.getCollection(index.collection).aggregate([
    { $group: { _id: '$' + index.duplicateField, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'groups' },
  ]).toArray()
  duplicateCounts[index.name] = duplicate.length === 0 ? 0 : duplicate[0].groups
}
print(JSON.stringify({ database: target.getName(), collections, duplicateCounts }))
`

  return runMongoScript(script)
}

function runMongoCreate(indexes) {
  const script = `
const target = connect(process.env.MONGODB_URI)
if (target.getName() !== ${JSON.stringify(TARGET_DATABASE)}) throw new Error('Banco de destino inválido.')
const created = []
for (const index of ${JSON.stringify(indexes)}) {
  const options = { name: index.name, ...(index.options ?? {}) }
  target.getCollection(index.collection).createIndex(index.key, options)
  created.push(index.name)
}
print(JSON.stringify({ created }))
`

  return runMongoScript(script)
}

export function buildMongoInvocation(script, environment = process.env) {
  return {
    command: 'mongosh',
    args: ['--nodb', '--quiet', '--eval', script],
    options: {
      encoding: 'utf8',
      env: { ...environment },
      shell: false,
    },
  }
}

function runMongoScript(script) {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI não está definida; nenhum comando foi enviado ao MongoDB.')
  }

  const invocation = buildMongoInvocation(script)
  const result = spawnSync(invocation.command, invocation.args, invocation.options)

  if (result.error) throw new Error(`Não foi possível executar mongosh: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`mongosh falhou: ${sanitizedError(result.stderr || result.stdout || 'erro sem detalhes')}`)
  }

  try {
    return JSON.parse(result.stdout.trim())
  } catch {
    throw new Error('mongosh não retornou JSON operacional válido; saída omitida por segurança.')
  }
}

export function assertTarget(report, { apply = false } = {}) {
  if (report.database !== TARGET_DATABASE) {
    throw new Error(`Banco de destino inválido: esperado ${TARGET_DATABASE}; operação interrompida.`)
  }
  if (report.collections.equipment === null) {
    throw new Error('equipment: coleção ausente; não é possível auditar a base operacional.')
  }
  if (apply && report.collections.actransfers === null) {
    throw new Error('actransfers: coleção ausente; coleção não será criada automaticamente. Crie-a em procedimento operacional aprovado e execute novamente.')
  }
}

export function formatReport(report, comparison) {
  const absentCollections = Object.entries(report.collections)
    .filter(([, indexes]) => indexes === null)
    .map(([collection]) => `${collection}: coleção ausente; índices pendentes`)

  return [
    `Banco validado: ${report.database}`,
    ...absentCollections,
    `Corretos: ${comparison.present.length > 0 ? comparison.present.map(({ expected }) => expected.name).join(', ') : 'nenhum'}`,
    `Ausentes: ${comparison.missing.length > 0 ? comparison.missing.map((index) => index.name).join(', ') : 'nenhum'}`,
    `Conflitantes: ${comparison.incompatible.length > 0 ? comparison.incompatible.map(({ expected }) => expected.name).join(', ') : 'nenhum'}`,
  ].join('\n')
}

function printReport(report, comparison) {
  console.log(formatReport(report, comparison))
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  if (options.help) {
    console.log(usage())
    return 0
  }

  validateApplyArguments(options)
  const report = runMongoRead()
  assertTarget(report, options)
  const actual = Object.values(report.collections).flat().filter(Boolean)
  const comparison = classifyIndexes(expectedIndexes, actual)
  printReport(report, comparison)

  if (comparison.incompatible.length > 0) {
    throw new Error('Há índices com chave equivalente e propriedades incompatíveis; nenhum índice foi alterado.')
  }

  const duplicateChecks = duplicateChecksFor(comparison.missing, report.duplicateCounts)
  const duplicateConflicts = duplicateChecks.filter((index) => index.duplicateCount > 0)
  if (duplicateConflicts.length > 0) {
    throw new Error(`Duplicidades impedem índices únicos: ${duplicateConflicts.map((index) => index.name).join(', ')}.`)
  }

  if (!options.apply) return comparison.missing.length === 0 ? 0 : 2
  if (comparison.missing.length === 0) {
    console.log('Nenhum índice ausente; nenhuma alteração necessária.')
    return 0
  }

  const created = runMongoCreate(comparison.missing)
  console.log(`Índices criados: ${created.created.join(', ')}`)
  const after = runMongoRead()
  assertTarget(after, options)
  const afterComparison = classifyIndexes(expectedIndexes, Object.values(after.collections).flat().filter(Boolean))
  if (afterComparison.missing.length > 0 || afterComparison.incompatible.length > 0) {
    throw new Error('A verificação pós-criação não confirmou todos os índices esperados.')
  }
  console.log('Verificação pós-criação: todos os índices estão compatíveis.')
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha operacional não identificada.')
    process.exitCode = 1
  }
}
