import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseImportArgs(argv) {
  const result = { command: argv[0] && !argv[0].startsWith('--') ? argv[0] : 'dry-run', apply: false, rollback: false, uriEnv: 'MONGODB_URI', authorizeApply: false, authorizeRollback: false }
  for (let index = result.command === 'dry-run' && argv[0]?.startsWith('--') ? 0 : 1; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply') { result.command = 'apply'; result.apply = true }
    else if (argument === '--rollback') { result.command = 'rollback'; result.rollback = true }
    else if (argument === '--authorize-apply') result.authorizeApply = true
    else if (argument === '--authorize-rollback') result.authorizeRollback = true
    else if (argument === '--uri-env') result.uriEnv = argv[++index]
    else if (argument === '--confirm-batch') result.confirmBatch = argv[++index]
    else if (argument === '--backup-id') result.backupId = argv[++index]
    else if (argument === '--batch') result.batch = argv[++index]
    else if (argument === '--execute') result.execute = true
    else if (argument === '--audit-export') result.auditExport = argv[++index]
    else if (argument === '--catalog') result.catalog = argv[++index]
    else if (argument === '--equipment') result.equipment = argv[++index]
    else if (argument === '--manifest') result.manifest = argv[++index]
    else throw new Error(`unknown_import_argument:${argument}`)
  }
  if (result.command === 'apply' && (!result.confirmBatch || !result.backupId || !result.authorizeApply)) throw new Error('apply_requires_batch_backup_and_authorization')
  if (result.command === 'rollback' && (!result.batch || !result.authorizeRollback)) throw new Error('rollback_requires_batch_and_authorization')
  return result
}

export function buildChildEnvironment(environment = process.env) {
  const result = { PATH: environment.PATH ?? '' }
  if (environment.MONGODB_URI) result.MONGODB_URI = environment.MONGODB_URI
  return result
}

export function spawnImportCli(argv, environment = process.env) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const tsx = path.join(root, 'backend/node_modules/.bin/tsx')
  const cli = path.join(root, 'backend/src/operations/pmpaImportCli.ts')
  return spawn(tsx, [cli, ...argv], { cwd: root, env: buildChildEnvironment(environment), stdio: 'inherit', shell: false })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseImportArgs(process.argv.slice(2))
    const child = spawnImportCli(process.argv.slice(2))
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
}
