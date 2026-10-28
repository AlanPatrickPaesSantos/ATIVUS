import assert from 'node:assert/strict'
import test from 'node:test'

import { buildChildEnvironment, parseImportArgs } from './pmpa-import.mjs'

test('defaults to dry-run and does not load dotenv or production configuration files', () => {
  const parsed = parseImportArgs([])
  assert.equal(parsed.command, 'dry-run')
  assert.equal(parsed.apply, false)
  assert.equal(parsed.rollback, false)
  assert.equal(parsed.uriEnv, 'MONGODB_URI')
})

test('parses explicit apply and rollback confirmations without exposing secrets', () => {
  const parsed = parseImportArgs(['apply', '--confirm-batch', 'demo-batch', '--backup-id', 'backup-1', '--authorize-apply'])
  assert.equal(parsed.command, 'apply')
  assert.equal(parsed.confirmBatch, 'demo-batch')
  assert.equal(parsed.backupId, 'backup-1')
  assert.equal(parsed.authorizeApply, true)
  const rollback = parseImportArgs(['rollback', '--batch', 'demo-batch', '--authorize-rollback'])
  assert.equal(rollback.authorizeRollback, true)
  const auditedRollback = parseImportArgs(['rollback', '--batch', 'demo-batch', '--authorize-rollback', '--audit-export', '/tmp/rollback-audit.json'])
  assert.equal(auditedRollback.auditExport, '/tmp/rollback-audit.json')
})

test('passes only the explicitly supported Mongo URI variable to the child process', () => {
  const environment = buildChildEnvironment({ MONGODB_URI: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0', ATLAS_URI: 'mongodb+srv://secret', RENDER_API_KEY: 'secret', PATH: '/bin' })
  assert.deepEqual(environment, { MONGODB_URI: 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0', PATH: '/bin' })
})
