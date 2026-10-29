import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'

export const HOMOLOGATION_SCOPE = 'ativus-homologacao-local'
export const HOMOLOGATION_ROOT = '/tmp/ativus-homologation'
export const MONGO_URI = 'mongodb://127.0.0.1:27018/ativus_homolog?directConnection=true&replicaSet=rs0'
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{5,47}$/

export function createRunId(now = new Date(), uuid = randomUUID()) {
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `${timestamp}-${uuid.replace(/-/g, '').slice(0, 12).toLowerCase()}`
}

export function buildMongoUri(runId = 'default') {
  if (runId === 'default') return MONGO_URI
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Identificador de execução inválido.')
  return `mongodb://127.0.0.1:27018/ativus_homolog_${runId}?directConnection=true&replicaSet=rs0`
}
export function buildHomologationDataPreflightQuery() {
  return 'const result = { units: await db.units.countDocuments({}), equipment: await db.equipment.countDocuments({}), users: await db.users.countDocuments({}), auditEvents: await db.auditevents.countDocuments({}) }; print(JSON.stringify(result));'
}
const COMMANDS = new Set(['preflight', 'up', 'test', 'results', 'clean'])
const SECRET_KEYS = /password|token|cookie|session|digest|secret|authorization/i
const REQUIRED_TOOLS = ['podman', 'node', 'npm', 'jq', 'curl']

export function runCommand(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      ...options,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

async function checked(runner, file, args, options) {
  const result = await runner(file, args, options)
  if (result.code !== 0) {
    throw new Error(`${file} ${args.join(' ')} falhou: ${result.stderr.trim() || `código ${result.code}`}`)
  }
  return result
}

export function parseCommand(argv) {
  const [, , command = ''] = argv
  if (!COMMANDS.has(command)) {
    throw new Error(`Comando inválido. Use: ${[...COMMANDS].join(', ')}`)
  }
  return { command, args: argv.slice(3) }
}

export function validateLocalMongoUri(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('URI Mongo local obrigatória: use somente 127.0.0.1:27018 com replicaSet=rs0.')
  }
  const database = parsed.pathname.slice(1)
  const validDatabase = database === 'ativus_homolog' || /^ativus_homolog_[a-z0-9][a-z0-9-]{5,47}$/.test(database)
  if (parsed.protocol !== 'mongodb:' || parsed.hostname !== '127.0.0.1' || Number(parsed.port) !== 27018
    || parsed.username || parsed.password || parsed.searchParams.get('directConnection') !== 'true'
    || parsed.searchParams.get('replicaSet') !== 'rs0' || !validDatabase) {
    throw new Error('URI Mongo local obrigatória: use somente 127.0.0.1:27018 com replicaSet=rs0.')
  }
  return { database, port: Number(parsed.port) }
}

export function buildHomologationEnvironment(password, paths = {}) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('A senha sintética temporária deve possuir pelo menos 8 caracteres.')
  }

  const root = paths.root ?? HOMOLOGATION_ROOT
  const attachmentDir = paths.attachmentDir ?? `${root}/attachments`
  const mongoUri = paths.mongoUri ?? MONGO_URI
  validateLocalMongoUri(mongoUri)

  return {
    NODE_ENV: 'development',
    PORT: '3010',
    MONGODB_URI: mongoUri,
    SESSION_COOKIE_SECURE: 'false',
    SESSION_COOKIE_SAME_SITE: 'lax',
    ALLOWED_ORIGINS: 'http://127.0.0.1:4173',
    ATTACHMENT_STORAGE_DRIVER: 'local',
    ATTACHMENT_STORAGE_DIR: attachmentDir,
    HOMOLOGATION_SEED_PASSWORD: password,
    VITE_API_BASE_URL: 'http://127.0.0.1:3010/api/v1',
    VITE_BACKEND_URL: 'http://127.0.0.1:3010',
    VITE_ENABLE_MSW: 'false',
    E2E_REAL_BACKEND_URL: 'http://127.0.0.1:3010',
    E2E_REAL_FRONTEND_PORT: '4173',
    E2E_REAL_DITEL_REGISTRATION: 'hml-admin',
    E2E_REAL_UNIT_REGISTRATION: 'hml-unit',
    E2E_REAL_UNIT_ID: 'hml-unit',
    E2E_REAL_REQUIRE_ENV: 'true',
  }
}

function safeProcessEnvironment(values, root = HOMOLOGATION_ROOT) {
  return {
    ...values,
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: `${root}/home`,
    NPM_CONFIG_USERCONFIG: '/dev/null',
  }
}

function buildFrontendEnvironment(root = HOMOLOGATION_ROOT) {
  return safeProcessEnvironment({
    NODE_ENV: 'development',
    VITE_API_BASE_URL: 'http://127.0.0.1:3010/api/v1',
    VITE_BACKEND_URL: 'http://127.0.0.1:3010',
    VITE_ENABLE_MSW: 'false',
    E2E_REAL_BACKEND_URL: 'http://127.0.0.1:3010',
    E2E_REAL_FRONTEND_PORT: '4173',
  }, root)
}

export function buildPlaywrightEnvironment(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('A senha sintética temporária deve possuir pelo menos 8 caracteres.')
  }
  return safeProcessEnvironment({
    NODE_ENV: 'development',
    VITE_API_BASE_URL: 'http://127.0.0.1:3010/api/v1',
    VITE_BACKEND_URL: 'http://127.0.0.1:3010',
    VITE_ENABLE_MSW: 'false',
    E2E_REAL_BACKEND_URL: 'http://127.0.0.1:3010',
    E2E_REAL_FRONTEND_PORT: '4173',
    E2E_REAL_DITEL_REGISTRATION: 'hml-admin',
    E2E_REAL_DITEL_PASSWORD: password,
    E2E_REAL_UNIT_REGISTRATION: 'hml-unit',
    E2E_REAL_UNIT_ID: 'hml-unit',
    E2E_REAL_UNIT_PASSWORD: password,
    E2E_REAL_UNIT_A_REGISTRATION: 'hml-unit-a',
    E2E_REAL_UNIT_A_PASSWORD: password,
    E2E_REAL_UNIT_A_ID: 'hml-unit-a',
    E2E_REAL_UNIT_B_REGISTRATION: 'hml-unit-b',
    E2E_REAL_UNIT_B_PASSWORD: password,
    E2E_REAL_UNIT_B_ID: 'hml-unit-b',
    E2E_REAL_AC_REGISTRATION: 'hml-ac',
    E2E_REAL_AC_PASSWORD: password,
    E2E_REAL_REQUIRE_ENV: 'true',
  })
}

export async function runPlaywrightScenario(state, password, { runner = runCommand } = {}) {
  const result = await checked(runner, 'npm', ['run', 'test:e2e:real', '--', '--project=chromium-real-backend', 'e2e-real/real-backend-smoke.spec.ts', 'e2e-real/patrimonial-real.spec.ts'], {
    cwd: path.join(state.repoRoot ?? process.cwd(), 'frontend'),
    env: buildPlaywrightEnvironment(password),
    shell: false,
  })
  return { ok: true, command: 'test:e2e:real' }
}

export function assertLocalUrl(value, label) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`URL local inválida para ${label}.`)
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') {
    throw new Error(`URL local obrigatória para ${label}.`)
  }
  return parsed
}

export function spawnManaged(file, args, options = {}) {
  const child = spawn(file, args, { ...options, shell: false, stdio: 'ignore' })
  return { pid: child.pid, command: file, args, cwd: options.cwd, owner: options.owner }
}

async function readProcessIdentity(pid) {
  try {
    const [cwd, cmdline] = await Promise.all([
      fs.readlink(`/proc/${pid}/cwd`),
      fs.readFile(`/proc/${pid}/cmdline`, 'utf8'),
    ])
    return { cwd, cmdline: cmdline.replaceAll('\0', ' ') }
  } catch {
    return null
  }
}

export async function verifyOwnedProcess(processState, reader = readProcessIdentity, { allowMissing = false } = {}) {
  if (!Number.isSafeInteger(processState?.pid) || processState.pid <= 1) {
    throw new Error(`PID inválido para limpeza: ${processState?.pid}`)
  }
  const identity = await reader(processState.pid)
  const commandMatches = identity?.cmdline?.includes(processState.command)
    && processState.args.every((arg) => identity.cmdline.includes(arg))
  if (!identity && allowMissing) return false
  if (!identity || identity.cwd !== processState.cwd || !commandMatches) {
    throw new Error(`Processo ${processState.pid} não pertence à execução de homologação.`)
  }
  return true
}

export async function startBackend(state, password, { spawner = spawnManaged } = {}) {
  const root = state.root ?? HOMOLOGATION_ROOT
  const environment = safeProcessEnvironment(buildHomologationEnvironment(password, {
    root,
    attachmentDir: path.join(root, 'attachments'),
    mongoUri: state.mongo.uri,
  }), root)
  const backendUrl = assertLocalUrl('http://127.0.0.1:3010/api/v1/health', 'backend')
  const processState = spawner('npm', ['run', 'dev'], {
    cwd: path.join(state.repoRoot ?? process.cwd(), 'backend'),
    env: environment,
    shell: false,
    owner: state.runId,
  })
  return { ...processState, name: 'backend', url: backendUrl.origin }
}

export async function startFrontend(state, { spawner = spawnManaged } = {}) {
  const environment = buildFrontendEnvironment(state.root ?? HOMOLOGATION_ROOT)
  const frontendUrl = assertLocalUrl('http://127.0.0.1:4173', 'frontend')
  const processState = spawner('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: path.join(state.repoRoot ?? process.cwd(), 'frontend'),
    env: environment,
    shell: false,
    owner: state.runId,
  })
  return { ...processState, name: 'frontend', url: frontendUrl.origin }
}

export async function waitForHttp(url, expectedStatus, { fetchImpl = fetch, attempts = 30, delayMs = 1000 } = {}) {
  assertLocalUrl(url, 'health check')
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url)
      if (response.status === expectedStatus) return true
    } catch {
      // Process startup is expected to fail transiently until the listener exists.
    }
    if (attempt === attempts - 1) break
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error(`HTTP ${url} não atingiu status ${expectedStatus}.`)
}

class CookieJar {
  #cookies = new Map()

  update(response) {
    const values = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean)
    for (const value of values) {
      const [pair] = value.split(';')
      const separator = pair.indexOf('=')
      if (separator > 0) this.#cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
  }

  header() {
    return [...this.#cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
  }
}

export function assertStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label}: esperado HTTP ${expected}, recebido ${response.status}.`)
}

async function responseJson(response, label) {
  const value = await response.json()
  const serialized = JSON.stringify(value)
  if (/passwordHash|tokenDigest|sessionId/i.test(serialized)) {
    throw new Error(`${label}: resposta expôs dado sensível.`)
  }
  return value
}

async function apiRequest(baseUrl, jar, method, route, { fetchImpl, body, headers = {} } = {}) {
  const requestHeaders = { Origin: 'http://127.0.0.1:4173', ...headers }
  const cookie = jar?.header()
  if (cookie) requestHeaders.Cookie = cookie
  const response = await fetchImpl(`${baseUrl}${route}`, {
    method,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  jar?.update(response)
  return response
}

export async function login(cookieJar, registration, password, { fetchImpl = fetch, baseUrl = 'http://127.0.0.1:3010/api/v1' } = {}) {
  const response = await apiRequest(baseUrl, cookieJar, 'POST', '/auth/login', {
    fetchImpl,
    headers: { 'Content-Type': 'application/json' },
    body: { registration, password },
  })
  assertStatus(response, 200, `login ${registration}`)
  return responseJson(response, `login ${registration}`)
}

export async function runApiScenario(state, password, {
  fetchImpl = fetch,
  baseUrl = 'http://127.0.0.1:3010/api/v1',
  writeEvidence = async (name, data) => fs.writeFile(path.join(state.root ?? HOMOLOGATION_ROOT, 'evidence', name), data),
} = {}) {
  assertLocalUrl(baseUrl, 'backend API')
  const scenarioId = `${state.runId ?? 'legacy'}-${createRunId().slice(-8)}`
  const fixtureSuffix = scenarioId.replace(/[^a-z0-9-]/gi, '').slice(-18)
  const acRegistration = `hml-ac-${fixtureSuffix}`
  const patrimony = `AC-${fixtureSuffix}`
  const idempotencyKey = `transfer-${fixtureSuffix}`
  const ditel = new CookieJar()
  const ac = new CookieJar()
  const unit = new CookieJar()
  const statuses = {}

  await login(ditel, 'hml-admin', password, { fetchImpl, baseUrl })
  const session = await apiRequest(baseUrl, ditel, 'GET', '/session', { fetchImpl })
  assertStatus(session, 200, 'sessão DITEL')
  await responseJson(session, 'sessão DITEL')

  const acUser = await apiRequest(baseUrl, ditel, 'POST', '/admin/users', {
    fetchImpl,
    headers: { 'Content-Type': 'application/json' },
    body: { name: `Operador AC ${fixtureSuffix}`, registration: acRegistration, role: 'ac_operator', password, unit: null },
  })
  assertStatus(acUser, 201, 'cadastro operador AC')
  await responseJson(acUser, 'cadastro operador AC')
  await login(ac, acRegistration, password, { fetchImpl, baseUrl })

  const material = await apiRequest(baseUrl, ac, 'POST', '/ac/materials', {
    fetchImpl,
    headers: { 'Content-Type': 'application/json' },
    body: {
      patrimony, type: 'Rádio sintético', model: 'ATIVUS-HML', brand: 'Marca Fictícia',
      situation: 'active', location: 'Almoxarifado AC', category: 'Homologação',
    },
  })
  assertStatus(material, 201, 'cadastro equipamento AC')
  const materialBody = await responseJson(material, 'cadastro equipamento AC')

  const transferBody = {
    destinationUnit: { id: 'hml-unit', name: 'Unidade Homologação', acronym: 'HML' },
    distributedAt: '2026-10-27T12:00:00.000Z',
    deliverer: { name: 'Entrega Sintética' }, receiver: { name: 'Recebimento Sintético' },
    bg: { number: `BG-${fixtureSuffix}` }, equipmentIds: [materialBody.id],
  }
  const firstTransfer = await apiRequest(baseUrl, ac, 'POST', '/ac/transfers', {
    fetchImpl, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: transferBody,
  })
  statuses.firstTransfer = firstTransfer.status
  assertStatus(firstTransfer, 201, 'primeira transferência AC')
  const transfer = await responseJson(firstTransfer, 'primeira transferência AC')

  const replayTransfer = await apiRequest(baseUrl, ac, 'POST', '/ac/transfers', {
    fetchImpl, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: transferBody,
  })
  statuses.replayTransfer = replayTransfer.status
  assertStatus(replayTransfer, 200, 'replay transferência AC')
  const replay = await responseJson(replayTransfer, 'replay transferência AC')
  if (replay.id !== transfer.id) throw new Error('Idempotência não retornou a transferência original.')

  await login(unit, 'hml-unit', password, { fetchImpl, baseUrl })
  const unitSession = await apiRequest(baseUrl, unit, 'GET', '/session', { fetchImpl })
  assertStatus(unitSession, 200, 'sessão unidade')
  await responseJson(unitSession, 'sessão unidade')
  const inventory = await apiRequest(baseUrl, unit, 'GET', `/inventory?page=1&pageSize=20&search=${encodeURIComponent(patrimony)}`, { fetchImpl })
  assertStatus(inventory, 200, 'custódia unidade')
  const inventoryBody = await responseJson(inventory, 'custódia unidade')
  if (!inventoryBody.items?.some((item) => item.patrimony === patrimony)) throw new Error('Custódia não chegou à unidade HML.')

  const forbidden = await apiRequest(baseUrl, unit, 'GET', '/admin/users', { fetchImpl })
  statuses.unitAdmin = forbidden.status
  assertStatus(forbidden, 403, 'permissão unidade antes do logout')
  await responseJson(forbidden, 'permissão unidade antes do logout')

  const report = await apiRequest(baseUrl, ditel, 'GET', '/ac/reports/patrimonial?from=2026-10-27&to=2026-10-27&unitId=hml-unit&page=1&pageSize=20', { fetchImpl })
  assertStatus(report, 200, 'relatório patrimonial AC')
  const reportBody = await responseJson(report, 'relatório patrimonial AC')
  if (reportBody.distributions?.total !== 1) throw new Error('Relatório patrimonial não registrou a distribuição.')

  await fs.mkdir(path.join(state.root ?? HOMOLOGATION_ROOT, 'evidence'), { recursive: true })
  for (const format of ['pdf', 'docx']) {
    const document = await apiRequest(baseUrl, ac, 'GET', `/ac/transfers/${transfer.id}/document?format=${format}`, { fetchImpl })
    assertStatus(document, 200, `documento ${format.toUpperCase()}`)
    const contentType = document.headers.get('content-type') ?? ''
    const expectedType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (!contentType.includes(expectedType)) throw new Error(`MIME inválido para documento ${format.toUpperCase()}.`)
    await writeEvidence(`transfer.${format}`, Buffer.from(await document.arrayBuffer()))
  }

  const invalidOrigin = await fetchImpl(`${baseUrl}/auth/login`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:4999', 'Access-Control-Request-Method': 'POST' },
  })
  assertStatus(invalidOrigin, 204, 'CORS origem inválida')
  if (invalidOrigin.headers.get('access-control-allow-origin')) {
    throw new Error('CORS origem inválida: resposta não pode autorizar a origem.')
  }

  const logout = await apiRequest(baseUrl, unit, 'POST', '/auth/logout', { fetchImpl })
  assertStatus(logout, 204, 'logout unidade')
  const afterLogout = await apiRequest(baseUrl, unit, 'GET', '/session', { fetchImpl })
  statuses.afterLogout = afterLogout.status
  assertStatus(afterLogout, 401, 'sessão após logout')
  await responseJson(afterLogout, 'sessão após logout')

  return { ok: true, statuses, transferId: transfer.id, fixtureSuffix, evidence: ['transfer.pdf', 'transfer.docx'] }
}

export function ownedResourceState(options = {}) {
  const runId = options.runId ?? createRunId()
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Identificador de execução inválido.')
  const mongoUri = options.mongoUri ?? buildMongoUri(runId)
  return {
    version: 1,
    scope: HOMOLOGATION_SCOPE,
    runId,
    root: options.root ?? HOMOLOGATION_ROOT,
    labels: { scope: HOMOLOGATION_SCOPE, run: runId },
    mongo: {
      container: `ativus-hml-${runId}-mongo`,
      network: `ativus-hml-${runId}-net`,
      volume: `ativus-hml-${runId}-data`,
      image: 'docker.io/library/mongo:7.0',
      hostPort: 27018,
      replicaSet: 'rs0',
      uri: mongoUri,
    },
    processes: {},
    evidence: {},
  }
}

export function serializePublicResult(value) {
  const redact = (input) => {
    if (Array.isArray(input)) return input.map(redact)
    if (!input || typeof input !== 'object') return input

    return Object.fromEntries(Object.entries(input)
      .filter(([key]) => !SECRET_KEYS.test(key))
      .map(([key, nested]) => [key, redact(nested)]))
  }

  return JSON.stringify(redact(value), null, 2)
}

export async function writeResult(report, { root = HOMOLOGATION_ROOT } = {}) {
  const redacted = JSON.parse(serializePublicResult({ generatedAt: new Date().toISOString(), ...report }))
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path.join(root, 'results.json'), `${JSON.stringify(redacted, null, 2)}\n`, 'utf8')
  const lines = [
    '# ATIVUS homologação local',
    '',
    `Status: ${redacted.status ?? 'unknown'}`,
    `Gerado em: ${redacted.generatedAt}`,
    '',
    '## Verificações',
    ...Object.entries(redacted.checks ?? {}).map(([name, status]) => `- ${name}: ${status}`),
  ]
  await fs.writeFile(path.join(root, 'results.md'), `${lines.join('\n')}\n`, 'utf8')
  return redacted
}

export async function readResults({ root = HOMOLOGATION_ROOT } = {}) {
  return JSON.parse(await fs.readFile(path.join(root, 'results.json'), 'utf8'))
}

function assertOwnedState(state) {
  const validNames = [state.mongo?.container, state.mongo?.network, state.mongo?.volume]
    .every((name) => typeof name === 'string' && name.includes(`-${state.runId}-`))
  if (state.scope !== HOMOLOGATION_SCOPE || !RUN_ID_PATTERN.test(state.runId ?? '')
    || state.labels?.scope !== HOMOLOGATION_SCOPE || state.labels?.run !== state.runId
    || !validNames || validateLocalMongoUri(state.mongo?.uri).port !== 27018) {
    throw new Error('Estado de homologação inválido ou não pertencente ao escopo local.')
  }
}

export async function cleanOwned(state, {
  runner = runCommand,
  processKiller = (pid) => process.kill(pid, 'SIGTERM'),
  processVerifier = verifyOwnedProcess,
  removePath = (target) => fs.rm(target, { recursive: true, force: true }),
} = {}) {
  assertOwnedState(state)
  const processes = Object.values(state.processes ?? {})
  for (const processState of processes) {
    if (!Number.isSafeInteger(processState.pid) || processState.pid <= 1 || processState.pid === process.pid) {
      throw new Error(`PID inválido para limpeza: ${processState.pid}`)
    }
    if (processState.owner !== state.runId) {
      throw new Error(`Processo ${processState.pid} não pertence à execução de homologação.`)
    }
    await processVerifier(processState, readProcessIdentity, { allowMissing: true })
  }

  const ownedResources = {}
  for (const kind of ['container', 'volume', 'network']) {
    ownedResources[kind] = await verifyOwnedResource(kind, state.mongo[kind], state.scope, runner, state.runId, { allowMissing: true })
  }
  for (const processState of processes) {
    const identity = await processVerifier(processState, readProcessIdentity, { allowMissing: true })
    if (identity !== false) processKiller(processState.pid)
  }

  if (ownedResources.container) await checked(runner, 'podman', ['rm', '--force', state.mongo.container])
  if (ownedResources.volume) await checked(runner, 'podman', ['volume', 'rm', state.mongo.volume])
  if (ownedResources.network) await checked(runner, 'podman', ['network', 'rm', state.mongo.network])
  await removePath(path.join(state.root, 'attachments'))
  await removePath(path.join(state.root, 'state.json'))

  return {
    ok: true,
    processes: processes.length,
    removed: [state.mongo.container, state.mongo.volume, state.mongo.network],
    preserved: [path.join(state.root, 'results.json'), path.join(state.root, 'results.md'), path.join(state.root, 'evidence')],
  }
}

export async function runPreflight({
  runner = runCommand,
  portChecker = isPortAvailable,
  playwrightPath = 'frontend/node_modules/.bin/playwright',
} = {}) {
  const missing = []
  const checks = {}
  for (const tool of REQUIRED_TOOLS) {
    try {
      const result = await runner('which', [tool])
      checks[tool] = result.code === 0
      if (result.code !== 0) missing.push(tool)
    } catch {
      checks[tool] = false
      missing.push(tool)
    }
  }

  try {
    const playwright = await runner(playwrightPath, ['--version'])
    checks.playwright = playwright.code === 0
    if (playwright.code !== 0) missing.push('playwright')
  } catch {
    checks.playwright = false
    missing.push('playwright')
  }

  let podmanInfo = null
  try {
    podmanInfo = await checked(runner, 'podman', ['info', '--format', '{{.Host.OS}} {{.Version.Version}}'])
    checks.podmanInfo = true
  } catch {
    checks.podmanInfo = false
    missing.push('podman-info')
  }

  checks.mongoPort27018Available = await portChecker(27018)
  checks.backendPort3010Available = await portChecker(3010)
  checks.frontendPort4173Available = await portChecker(4173)
  if (!checks.mongoPort27018Available) missing.push('port-27018')
  if (!checks.backendPort3010Available) missing.push('port-3010')
  if (!checks.frontendPort4173Available) missing.push('port-4173')
  checks.isolatedMongoUri = validateLocalMongoUri(MONGO_URI).port === 27018

  if (!checks.mongoPort27018Available) {
    try {
      const data = await checked(runner, 'mongosh', [MONGO_URI, '--quiet', '--eval', buildHomologationDataPreflightQuery()])
      const line = data.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
      checks.homologationData = true
      checks.homologationCounts = line ? JSON.parse(line) : null
    } catch {
      checks.homologationData = false
      missing.push('homologation-data')
    }
  }

  return {
    ok: missing.length === 0,
    missing: [...new Set(missing)],
    checks,
    podmanInfo: podmanInfo?.stdout.trim() ?? null,
    mongoUri: MONGO_URI,
  }
}

export async function isPortAvailable(port, host = '127.0.0.1') {
  const { createServer } = await import('node:net')
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, host, () => server.close(() => resolve(true)))
  })
}

export async function verifyOwnedResource(kind, name, label, runner = runCommand, runId, { allowMissing = false } = {}) {
  const inspectArgs = kind === 'container'
    ? ['inspect', name, '--format', runId ? '{{ index .Config.Labels "io.ativus.scope" }}|{{ index .Config.Labels "io.ativus.run" }}' : '{{ index .Config.Labels "io.ativus.scope" }}']
    : kind === 'volume'
      ? ['volume', 'inspect', name, '--format', runId ? '{{ index .Labels "io.ativus.scope" }}|{{ index .Labels "io.ativus.run" }}' : '{{ index .Labels "io.ativus.scope" }}']
      : ['network', 'inspect', name, '--format', runId ? '{{ index .Labels "io.ativus.scope" }}|{{ index .Labels "io.ativus.run" }}' : '{{ index .Labels "io.ativus.scope" }}']
  const result = await runner('podman', inspectArgs)
  if (result.code !== 0) {
    if (allowMissing) return false
    throw new Error(`podman ${inspectArgs.join(' ')} falhou: ${result.stderr.trim() || `código ${result.code}`}`)
  }
  const expected = runId ? `${label}|${runId}` : label
  if (result.stdout.trim() !== expected) {
    throw new Error(`${kind} ${name} não pertence à homologação local.`)
  }
  return true
}

export async function waitForReplicaSet(mongo, runner = runCommand, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const ping = await runner('podman', [
      'exec', mongo.container, 'mongosh', '--quiet', 'mongodb://127.0.0.1:27018/admin',
      '--eval', 'db.adminCommand({ ping: 1 }).ok',
    ])
    if (ping.code === 0 && ping.stdout.trim() === '1') break
    if (attempt === attempts - 1) throw new Error('MongoDB não respondeu ao ping no container.')
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  await runner('podman', [
    'exec', mongo.container, 'mongosh', '--quiet', 'mongodb://127.0.0.1:27018/admin',
    '--eval', 'try { rs.status(); print("already") } catch (error) { rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27018"}]}); print("initialized") }',
  ])

  const status = await checked(runner, 'podman', [
    'exec', mongo.container, 'mongosh', '--quiet', 'mongodb://127.0.0.1:27018/admin',
    '--eval', 'rs.status().members.map(member => member.name).join("\\n")',
  ])
  if (!status.stdout.split(/\r?\n/).map((line) => line.trim()).includes('127.0.0.1:27018')) {
    throw new Error('Replica set não anunciou 127.0.0.1:27018.')
  }
}

export async function startMongo(state, runner = runCommand) {
  const mongo = state.mongo
  const label = [`--label`, `io.ativus.scope=${state.scope}`, '--label', `io.ativus.run=${state.runId}`]

  const network = await runner('podman', ['network', 'inspect', mongo.network])
  if (network.code !== 0) await checked(runner, 'podman', ['network', 'create', ...label, mongo.network])
  else await verifyOwnedResource('network', mongo.network, state.scope, runner, state.runId)

  const volume = await runner('podman', ['volume', 'inspect', mongo.volume])
  if (volume.code !== 0) await checked(runner, 'podman', ['volume', 'create', ...label, mongo.volume])
  else await verifyOwnedResource('volume', mongo.volume, state.scope, runner, state.runId)

  const container = await runner('podman', ['inspect', mongo.container])
  if (container.code === 0) {
    await verifyOwnedResource('container', mongo.container, state.scope, runner, state.runId)
    const running = await runner('podman', ['inspect', mongo.container, '--format', '{{.State.Running}}'])
    if (running.code === 0 && running.stdout.trim() !== 'true') {
      await checked(runner, 'podman', ['start', mongo.container])
    }
    await waitForReplicaSet(mongo, runner)
    return { ...mongo }
  }

  await checked(runner, 'podman', ['pull', mongo.image])
  await checked(runner, 'podman', [
    'run', '--detach', '--name', mongo.container, '--network', mongo.network,
    '--publish', '127.0.0.1:27018:27018', '--volume', `${mongo.volume}:/data/db`,
    ...label, mongo.image, 'mongod', '--replSet', mongo.replicaSet,
    '--bind_ip_all', '--port', '27018',
  ])

  await waitForReplicaSet(mongo, runner)
  return { ...mongo }
}

async function readState({ root = HOMOLOGATION_ROOT } = {}) {
  return JSON.parse(await fs.readFile(path.join(root, 'state.json'), 'utf8'))
}

export async function loadOrCreateState({ root = HOMOLOGATION_ROOT, repoRoot = process.cwd() } = {}) {
  try {
    const state = await readState({ root })
    assertOwnedState(state)
    return { ...state, repoRoot }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return { ...ownedResourceState({ root }), repoRoot }
  }
}

async function writeState(state, { root = state.root ?? HOMOLOGATION_ROOT } = {}) {
  await fs.mkdir(root, { recursive: true })
  const safeState = { ...state, root }
  delete safeState.password
  delete safeState.secret
  await fs.writeFile(path.join(root, 'state.json'), `${JSON.stringify(safeState, null, 2)}\n`, 'utf8')
  return safeState
}

export async function readSyntheticPassword({ input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('A senha sintética deve ser informada em um terminal interativo; nunca via argumento ou ambiente.')
  }
  output.write('Senha sintética temporária: ')
  input.setRawMode(true)
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = () => {
      input.setRawMode(false)
      input.pause()
      output.write('\n')
      if (value.length < 8) reject(new Error('A senha sintética temporária deve possuir pelo menos 8 caracteres.'))
      else resolve(value)
    }
    input.resume()
    input.on('data', (chunk) => {
      const text = String(chunk)
      if (text === '\u0003') return reject(new Error('Entrada cancelada.'))
      if (text.includes('\r') || text.includes('\n')) return finish()
      if (text === '\u007f') value = value.slice(0, -1)
      else value += text
    })
  })
}

async function runBootstrap(state, password, runner = runCommand) {
  const env = safeProcessEnvironment(buildHomologationEnvironment(password, {
    root: state.root,
    attachmentDir: path.join(state.root, 'attachments'),
    mongoUri: state.mongo.uri,
  }), state.root)
  return checked(runner, 'npm', ['run', 'ops:homolog:bootstrap', '--', '--seed-non-prod'], {
    cwd: path.join(state.repoRoot ?? process.cwd(), 'backend'),
    env,
    shell: false,
  })
}

export async function commandPreflight({ root = HOMOLOGATION_ROOT } = {}) {
  const report = await runPreflight()
  await writeResult({ status: report.ok ? 'passed' : 'failed', checks: report.checks, missing: report.missing }, { root })
  if (!report.ok) throw new Error(`Pré-requisitos ausentes: ${report.missing.join(', ')}`)
  return report
}

export async function commandUp({ root = HOMOLOGATION_ROOT, repoRoot = process.cwd() } = {}) {
  const password = await readSyntheticPassword()
  const state = await loadOrCreateState({ root, repoRoot })
  validateLocalMongoUri(state.mongo.uri)
  await writeState(state)
  state.mongo = await startMongo(state)
  await writeState(state)
  if (!state.processes.backend || !(await verifyOwnedProcess(state.processes.backend, readProcessIdentity, { allowMissing: true }))) {
    state.processes.backend = await startBackend(state, password)
    await writeState(state)
  }
  if (!state.processes.frontend || !(await verifyOwnedProcess(state.processes.frontend, readProcessIdentity, { allowMissing: true }))) {
    state.processes.frontend = await startFrontend(state)
    await writeState(state)
  }
  await runBootstrap(state, password)
  await waitForHttp('http://127.0.0.1:3010/api/v1/health', 200)
  await waitForHttp('http://127.0.0.1:3010/api/v1/readiness', 200)
  await waitForHttp('http://127.0.0.1:4173', 200)
  const report = { status: 'up', checks: { mongo: true, health: true, readiness: true, backend: true, frontend: true } }
  await writeResult(report, { root })
  return report
}

export async function commandTest({ root = HOMOLOGATION_ROOT } = {}) {
  const state = await readState({ root })
  assertOwnedState(state)
  const password = await readSyntheticPassword()
  const api = await runApiScenario(state, password)
  const e2e = await runPlaywrightScenario(state, password)
  const report = { status: api.ok && e2e.ok ? 'passed' : 'failed', checks: { api, e2e } }
  await writeResult(report, { root })
  return report
}

export async function commandResults({ root = HOMOLOGATION_ROOT } = {}) {
  return readResults({ root })
}

export async function commandClean({ root = HOMOLOGATION_ROOT } = {}) {
  let state
  try {
    state = await readState({ root })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    const report = { ok: true, alreadyCleaned: true, preserved: [path.join(root, 'results.json'), path.join(root, 'results.md'), path.join(root, 'evidence')] }
    await writeResult({ status: 'cleaned', checks: report }, { root })
    return report
  }
  const result = await cleanOwned(state)
  await writeResult({ status: 'cleaned', checks: result }, { root })
  return result
}

export async function main(argv = process.argv) {
  const { command } = parseCommand(argv)
  if (command === 'preflight') return commandPreflight()
  if (command === 'up') return commandUp()
  if (command === 'test') return commandTest()
  if (command === 'results') return commandResults()
  if (command === 'clean') return commandClean()
  throw new Error(`Comando não implementado: ${command}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((result) => {
      if (result !== undefined) console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
