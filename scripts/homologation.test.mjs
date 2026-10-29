import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import {
  buildHomologationEnvironment,
  ownedResourceState,
  parseCommand,
  runPreflight,
  runApiScenario,
  buildPlaywrightEnvironment,
  runPlaywrightScenario,
  cleanOwned,
  readResults,
  writeResult,
  startBackend,
  startFrontend,
  serializePublicResult,
  startMongo,
  waitForReplicaSet,
  assertLocalUrl,
  waitForHttp,
  verifyOwnedResource,
  validateLocalMongoUri,
  readSyntheticPassword,
  buildHomologationDataPreflightQuery,
  verifyOwnedProcess,
  loadOrCreateState,
  commandClean,
} from './homologation.mjs'

test('parses only the supported homologation commands', () => {
  assert.deepEqual(parseCommand(['node', 'homologation.mjs', 'preflight']), { command: 'preflight', args: [] })
  assert.deepEqual(parseCommand(['node', 'homologation.mjs', 'results', '--json']), { command: 'results', args: ['--json'] })
  assert.throws(() => parseCommand(['node', 'homologation.mjs', 'unknown']), /comando inválido/i)
})

test('accepts only the fixed local Mongo direct replica-set URI', () => {
  assert.deepEqual(validateLocalMongoUri('mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0'), {
    database: 'ativus_homolog',
    port: 27018,
  })
  for (const uri of [
    'mongodb://localhost:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
    'mongodb://127.0.0.1:27017/ativus_homolog?directConnection=true&replicaSet=rs0',
    'mongodb+srv://example.invalid/ativus',
    'mongodb://user:password@127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0',
  ]) {
    assert.throws(() => validateLocalMongoUri(uri), /URI Mongo local obrigatória/i)
  }
})

test('builds a clean local environment without reading process-wide credentials', () => {
  const environment = buildHomologationEnvironment('synthetic-only', {
    root: '/tmp/ativus-homologation',
    attachmentDir: '/tmp/ativus-homologation/attachments',
  })

  assert.equal(environment.MONGODB_URI, 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0')
  assert.equal(environment.ALLOWED_ORIGINS, 'http://127.0.0.1:4173')
  assert.equal(environment.VITE_API_BASE_URL, 'http://127.0.0.1:3010/api/v1')
  assert.equal(environment.VITE_BACKEND_URL, 'http://127.0.0.1:3010')
  assert.equal(environment.VITE_ENABLE_MSW, 'false')
  assert.equal(environment.HOMOLOGATION_SEED_PASSWORD, 'synthetic-only')
  assert.equal(Object.hasOwn(environment, 'NODE_OPTIONS'), false)
})

test('synthetic password input is interactive-only and never accepted from a pipe', async () => {
  await assert.rejects(
    readSyntheticPassword({ input: { isTTY: false }, output: { write() {} } }),
    /terminal interativo/i,
  )
})

test('owned state and public result serialization exclude secrets', () => {
  const state = ownedResourceState({ root: '/tmp/ativus-homologation' })
  assert.equal(state.scope, 'ativus-homologacao-local')
  assert.equal(state.root, '/tmp/ativus-homologation')
  assert.equal(Object.hasOwn(state, 'password'), false)
  assert.equal(Object.hasOwn(state, 'token'), false)
  assert.equal(Object.hasOwn(state, 'cookie'), false)

  const serialized = serializePublicResult({ password: 'secret', token: 'secret', cookie: 'secret', status: 'passed' })
  assert.equal(serialized.includes('secret'), false)
  assert.equal(serialized.includes('password'), false)
  assert.equal(serialized.includes('token'), false)
  assert.equal(serialized.includes('cookie'), false)
  assert.match(serialized, /passed/)
})

test('creates unique run identities and resource names for each execution', () => {
  const first = ownedResourceState({ root: '/tmp/one', runId: '20261029-a1b2c3' })
  const second = ownedResourceState({ root: '/tmp/two', runId: '20261029-d4e5f6' })

  assert.notEqual(first.runId, second.runId)
  assert.notEqual(first.mongo.container, second.mongo.container)
  assert.notEqual(first.mongo.volume, second.mongo.volume)
  assert.notEqual(first.mongo.network, second.mongo.network)
  assert.match(first.mongo.uri, /ativus_homolog_20261029-a1b2c3/)
  assert.match(first.labels.run, /^20261029-a1b2c3$/)
})

test('recovers the same owned state after an interrupted startup', async () => {
  const root = `/tmp/ativus-homologation-resume-${process.pid}`
  await fs.rm(root, { recursive: true, force: true })
  const first = await loadOrCreateState({ root, repoRoot: '/repo' })
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(`${root}/state.json`, `${JSON.stringify(first)}\n`)
  const resumed = await loadOrCreateState({ root, repoRoot: '/repo' })
  assert.equal(resumed.runId, first.runId)
  assert.equal(resumed.mongo.container, first.mongo.container)
  await fs.rm(root, { recursive: true, force: true })
})

test('clean is idempotent when the owned state was already removed', async () => {
  const root = `/tmp/ativus-homologation-clean-empty-${process.pid}`
  await fs.rm(root, { recursive: true, force: true })
  const report = await commandClean({ root })
  assert.equal(report.ok, true)
  assert.equal(report.alreadyCleaned, true)
  await fs.rm(root, { recursive: true, force: true })
})

test('rejects cleanup when a recorded process identity does not match', async () => {
  await assert.rejects(
    verifyOwnedProcess(
      { pid: 123, command: 'npm', args: ['run', 'dev'], cwd: '/tmp/owned' },
      async () => ({ cwd: '/tmp/other', cmdline: 'npm run dev' }),
    ),
    /não pertence/i,
  )
})

test('preflight checks every required local dependency and port', async () => {
  const calls = []
  const runner = async (file, args) => {
    calls.push([file, args])
    return { code: 0, stdout: file === 'podman' ? 'linux 5.0\n' : `${file} ok\n`, stderr: '' }
  }

  const report = await runPreflight({
    runner,
    portChecker: async (port) => [27018, 3010, 4173].includes(port),
    playwrightPath: 'frontend/node_modules/.bin/playwright',
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.missing, [])
  assert.ok(calls.some(([file, args]) => file === 'podman' && args[0] === 'info'))
  assert.ok(calls.some(([file]) => file === 'frontend/node_modules/.bin/playwright'))
})

test('preflight uses the Podman-compatible host OS template', async () => {
  const runner = async (file, args) => {
    if (file === 'podman' && args[0] === 'info') {
      assert.deepEqual(args, ['info', '--format', '{{.Host.OS}} {{.Version.Version}}'])
    }
    return { code: 0, stdout: 'ok\n', stderr: '' }
  }

  const report = await runPreflight({
    runner,
    portChecker: async () => true,
    playwrightPath: 'frontend/node_modules/.bin/playwright',
  })

  assert.equal(report.ok, true)
})

test('preflight checks every local service port and reports unavailable ports', async () => {
  const runner = async () => ({ code: 0, stdout: 'ok\n', stderr: '' })
  const report = await runPreflight({
    runner,
    portChecker: async (port) => port !== 4173,
    playwrightPath: 'frontend/node_modules/.bin/playwright',
  })

  assert.equal(report.ok, false)
  assert.ok(report.missing.includes('port-4173'))
  assert.equal(report.checks.mongoPort27018Available, true)
  assert.equal(report.checks.backendPort3010Available, true)
  assert.equal(report.checks.frontendPort4173Available, false)
})

test('data preflight queries units instead of the legacy organizations collection', () => {
  const query = buildHomologationDataPreflightQuery()
  assert.match(query, /db\.units\.countDocuments\(\{\}\)/)
  assert.match(query, /db\.equipment\.countDocuments\(\{\}\)/)
  assert.match(query, /db\.users\.countDocuments\(\{\}\)/)
  assert.doesNotMatch(query, /db\.organizations/)
})

test('startMongo creates only labeled resources and advertises the host port', async () => {
  const calls = []
  const runner = async (file, args) => {
    calls.push([file, args])
    if ((args[0] === 'network' || args[0] === 'volume') && args[1] === 'inspect') return { code: 1, stdout: '', stderr: 'not found' }
    if (args[0] === 'inspect' && args.length === 2) return { code: 1, stdout: '', stderr: 'not found' }
    if (args[0] === 'exec' && args.at(-1)?.includes('ping')) return { code: 0, stdout: '1\n', stderr: '' }
    if (args[0] === 'exec' && args.at(-1)?.includes('rs.status')) return { code: 0, stdout: '127.0.0.1:27018\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }

  const state = ownedResourceState({ runId: '20261029-a1b2c3' })
  const mongo = await startMongo(state, runner)

  assert.equal(mongo.container, 'ativus-hml-20261029-a1b2c3-mongo')
  const run = calls.find(([, args]) => args[0] === 'run')
  assert.deepEqual(run[1].slice(0, 10), [
    'run', '--detach', '--name', 'ativus-hml-20261029-a1b2c3-mongo', '--network', 'ativus-hml-20261029-a1b2c3-net',
    '--publish', '127.0.0.1:27018:27018', '--volume', 'ativus-hml-20261029-a1b2c3-data:/data/db',
  ])
  assert.ok(run[1].includes('--label'))
  assert.ok(run[1].includes('io.ativus.scope=ativus-homologacao-local'))
  assert.ok(run[1].includes('io.ativus.run=20261029-a1b2c3'))
  assert.ok(run[1].includes('--replSet'))
  assert.ok(calls.some(([, args]) => args.at(-1)?.includes('127.0.0.1:27018')))
})

test('startMongo reuses an existing container only after verifying its run label', async () => {
  const state = ownedResourceState({ runId: '20261029-a1b2c3' })
  const calls = []
  const runner = async (file, args) => {
    calls.push([file, args])
    if (args.includes('{{.State.Running}}')) return { code: 0, stdout: 'true\n', stderr: '' }
    if (args.includes('--format')) return { code: 0, stdout: `${state.scope}|${state.runId}\n`, stderr: '' }
    if (args[0] === 'network' && args[1] === 'inspect') return { code: 0, stdout: '', stderr: '' }
    if (args[0] === 'volume' && args[1] === 'inspect') return { code: 0, stdout: '', stderr: '' }
    if (args[0] === 'exec' && args.at(-1)?.includes('ping')) return { code: 0, stdout: '1\n', stderr: '' }
    if (args[0] === 'exec' && args.at(-1)?.includes('rs.status')) return { code: 0, stdout: '127.0.0.1:27018\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }

  await startMongo(state, runner)
  assert.equal(calls.some(([, args]) => args[0] === 'run'), false)
  assert.equal(calls.some(([, args]) => args[0] === 'start'), false)
})

test('replica-set checks use a Mongo URI that mongosh parses correctly', async () => {
  const calls = []
  const runner = async (file, args) => {
    calls.push([file, args])
    if (args.at(-1)?.includes('rs.status().members')) return { code: 0, stdout: '127.0.0.1:27018\n', stderr: '' }
    if (args.at(-1)?.includes('rs.status();')) return { code: 0, stdout: 'already\n', stderr: '' }
    return { code: 0, stdout: '1\n', stderr: '' }
  }

  await waitForReplicaSet({ container: 'ativus-hml-mongo' }, runner, 1)
  const mongoshCalls = calls.filter(([file]) => file === 'podman')
  assert.ok(mongoshCalls.every(([, args]) => args.includes('mongodb://127.0.0.1:27018/admin')))
})

test('verifyOwnedResource rejects an unowned resource before cleanup', async () => {
  const runner = async () => ({ code: 0, stdout: 'other-scope\n', stderr: '' })
  await assert.rejects(
    verifyOwnedResource('container', 'ativus-hml-mongo', 'ativus-homologacao-local', runner),
    /não pertence/i,
  )
})

test('process startup passes only explicit local backend environment', async () => {
  const state = ownedResourceState({ root: '/tmp/ativus-homologation' })
  state.repoRoot = '/repo'
  const starts = []
  const spawner = (file, args, options) => {
    starts.push({ file, args, options })
    return { pid: starts.length + 100 }
  }

  const backend = await startBackend(state, 'synthetic-password', { spawner })
  const frontend = await startFrontend(state, { spawner })

  assert.equal(backend.pid, 101)
  assert.equal(frontend.pid, 102)
  assert.equal(starts[0].options.env.PORT, '3010')
  assert.equal(starts[0].options.env.ALLOWED_ORIGINS, 'http://127.0.0.1:4173')
  assert.equal(starts[0].options.env.SESSION_COOKIE_SECURE, 'false')
  assert.equal(starts[0].options.env.ATTACHMENT_STORAGE_DIR, '/tmp/ativus-homologation/attachments')
  assert.equal(starts[0].options.env.ATLAS_URI, undefined)
  assert.equal(starts[1].options.env.VITE_API_BASE_URL, 'http://127.0.0.1:3010/api/v1')
  assert.equal(starts[1].options.env.VITE_BACKEND_URL, 'http://127.0.0.1:3010')
  assert.equal(starts[1].options.env.VITE_ENABLE_MSW, 'false')
  assert.equal(starts[1].options.env.HOMOLOGATION_SEED_PASSWORD, undefined)
  assert.equal(starts[0].options.shell, false)
  assert.equal(starts[1].options.shell, false)
})

test('local URL validation rejects production and external hosts', () => {
  assert.equal(assertLocalUrl('http://127.0.0.1:3010/api/v1', 'backend').hostname, '127.0.0.1')
  assert.throws(() => assertLocalUrl('https://ativus.example.gov.br', 'backend'), /URL local/i)
  assert.throws(() => assertLocalUrl('http://127.0.0.2:3010', 'backend'), /URL local/i)
})

test('waitForHttp retries until the expected status without using real network', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { status: calls === 2 ? 200 : 503 }
  }
  await waitForHttp('http://127.0.0.1:3010/api/v1/health', 200, { fetchImpl, attempts: 3, delayMs: 0 })
  assert.equal(calls, 2)
})

test('runApiScenario uses the real API contracts and checks authorization before logout', async () => {
  const calls = []
  const evidence = []
  let nextId = 0
  let loggedOut = false
  const json = (status, body, cookie = false) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { 'set-cookie': `sigat_session=synthetic-${++nextId}; Path=/; HttpOnly` } : {}),
    },
  })
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url)
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ method: options.method ?? 'GET', path: parsed.pathname, query: parsed.search, body, headers: options.headers ?? {} })
    if (options.method === 'OPTIONS') return new Response(null, { status: 204 })
    if (parsed.pathname.endsWith('/auth/login')) return json(200, { role: body.registration.startsWith('hml-ac-') ? 'ac_operator' : body.registration === 'hml-unit' ? 'unit_user' : 'ditel_admin', registration: body.registration }, true)
    if (parsed.pathname.endsWith('/session')) return options.headers?.Cookie?.includes('synthetic') && !loggedOut ? json(200, { registration: 'hml-unit' }) : json(401, { code: 'UNAUTHENTICATED' })
    if (parsed.pathname.endsWith('/admin/users') && options.method === 'POST') return json(201, { role: 'ac_operator', registration: body.registration })
    if (parsed.pathname.endsWith('/admin/users')) return json(403, { code: 'FORBIDDEN' })
    if (parsed.pathname.endsWith('/ac/materials')) return json(201, { id: 'equipment-1', patrimony: body.patrimony })
    if (parsed.pathname.endsWith('/ac/transfers') && options.method === 'POST') return json(calls.filter((call) => call.path.endsWith('/ac/transfers') && call.method === 'POST').length === 1 ? 201 : 200, { id: 'transfer-1', status: 'confirmed' })
    if (parsed.pathname.endsWith('/ac/reports/patrimonial')) return json(200, { distributions: { total: 1 } })
    if (parsed.pathname.endsWith('/document')) return new Response(parsed.search.includes('pdf') ? '%PDF-1.7\n%%EOF' : Buffer.from('PK synthetic docx'), { status: 200, headers: { 'content-type': parsed.search.includes('pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } })
    if (parsed.pathname.endsWith('/inventory')) return json(200, { items: [{ patrimony: calls.find((call) => call.path.endsWith('/ac/materials'))?.body.patrimony }] })
    if (parsed.pathname.endsWith('/auth/logout')) {
      loggedOut = true
      return new Response(null, { status: 204 })
    }
    throw new Error(`unexpected request ${options.method ?? 'GET'} ${parsed.pathname}`)
  }

  const report = await runApiScenario({ root: '/tmp/ativus-homologation' }, 'synthetic-password', {
    fetchImpl,
    writeEvidence: async (name, data) => evidence.push({ name, size: data.byteLength }),
  })

  assert.equal(report.ok, true)
  assert.deepEqual(report.statuses, { firstTransfer: 201, replayTransfer: 200, unitAdmin: 403, afterLogout: 401 })
  assert.deepEqual(evidence.map((entry) => entry.name), ['transfer.pdf', 'transfer.docx'])
  assert.equal(calls.findIndex((call) => call.path.endsWith('/admin/users') && call.method === 'GET') < calls.findIndex((call) => call.path.endsWith('/auth/logout')), true)
  assert.ok(calls.some((call) => call.path.endsWith('/ac/transfers') && call.headers['Idempotency-Key'].startsWith('transfer-')))
  assert.ok(calls.some((call) => call.path.endsWith('/ac/materials') && call.body.category === 'Homologação'))
})

test('runPlaywrightScenario invokes only real-backend Chromium tests and excludes screenshots', async () => {
  const calls = []
  const runner = async (file, args, options) => {
    calls.push({ file, args, options })
    return { code: 0, stdout: 'passed', stderr: '' }
  }
  const environment = buildPlaywrightEnvironment('synthetic-password')
  assert.equal(environment.VITE_ENABLE_MSW, 'false')
  assert.equal(environment.E2E_REAL_FRONTEND_PORT, '4173')
  assert.equal(environment.E2E_REAL_REQUIRE_ENV, 'true')
  assert.equal(environment.E2E_REAL_DITEL_REGISTRATION, 'hml-admin')
  assert.equal(environment.E2E_REAL_UNIT_REGISTRATION, 'hml-unit')

  const report = await runPlaywrightScenario({ repoRoot: '/repo', root: '/tmp/ativus-homologation' }, 'synthetic-password', { runner })
  assert.equal(report.ok, true)
  assert.equal(Object.hasOwn(report, 'output'), false)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, ['run', 'test:e2e:real', '--', '--project=chromium-real-backend', 'e2e-real/real-backend-smoke.spec.ts', 'e2e-real/patrimonial-real.spec.ts'])
  assert.equal(calls[0].options.env.VITE_ENABLE_MSW, 'false')
  assert.equal(calls[0].options.env.E2E_REAL_BACKEND_URL, 'http://127.0.0.1:3010')
  assert.equal(calls[0].options.env.E2E_REAL_UNIT_A_REGISTRATION, 'hml-unit-a')
  assert.equal(calls[0].options.env.E2E_REAL_UNIT_B_REGISTRATION, 'hml-unit-b')
  assert.equal(calls[0].options.env.E2E_REAL_AC_REGISTRATION, 'hml-ac')
  assert.equal(calls.some(({ args }) => args.some((arg) => arg.includes('screenshots'))), false)
})

test('writeResult and readResults persist only redacted consolidated evidence', async () => {
  const root = `/tmp/ativus-homologation-result-${process.pid}`
  await fs.rm(root, { recursive: true, force: true })
  const written = await writeResult({ status: 'passed', password: 'secret', checks: { api: 'passed' } }, { root })
  const loaded = await readResults({ root })
  assert.equal(written.status, 'passed')
  assert.equal(loaded.password, undefined)
  assert.equal(loaded.checks.api, 'passed')
  assert.match(await fs.readFile(`${root}/results.md`, 'utf8'), /passed/)
  await fs.rm(root, { recursive: true, force: true })
})

test('cleanOwned terminates recorded processes and removes only owned resources', async () => {
  const state = ownedResourceState({ root: '/tmp/ativus-homologation-clean', runId: '20261029-a1b2c3' })
  state.processes = { backend: { pid: 101, owner: state.runId }, frontend: { pid: 102, owner: state.runId } }
  const calls = []
  const runner = async (file, args) => {
    calls.push([file, args])
    if (args.includes('inspect')) return { code: 0, stdout: `${state.scope}|${state.runId}`, stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
  const killed = []
  const removed = []
  const report = await cleanOwned(state, {
    runner,
    processKiller: (pid) => killed.push(pid),
    processVerifier: async () => true,
    removePath: async (target) => removed.push(target),
  })

  assert.equal(report.ok, true)
  assert.deepEqual(killed, [101, 102])
  assert.deepEqual(removed, [
    '/tmp/ativus-homologation-clean/attachments',
    '/tmp/ativus-homologation-clean/state.json',
  ])
  assert.equal(calls.some(([, args]) => args.includes('system') || args.includes('prune')), false)
  assert.equal(calls.filter(([, args]) => args[0] === 'rm' || args[0] === 'volume' || args[0] === 'network').length, 5)
})

test('cleanOwned refuses an invalid or current process PID', async () => {
  const state = ownedResourceState()
  state.processes = { backend: { pid: process.pid } }
  await assert.rejects(cleanOwned(state, { runner: async () => ({ code: 0, stdout: state.scope, stderr: '' }) }), /PID/i)
})
