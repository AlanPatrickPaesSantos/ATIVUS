import { expect, request as requestFactory, test } from '@playwright/test'
import {
  assertRealBackendEnvironment,
  missingRealBackendEnvironment,
  shouldSkipRealBackendSmoke,
} from './realBackendEnvironment'
import { REAL_HOMOLOGATION_UNITS } from './realHomologationUnits'

const backendUrl = process.env.E2E_REAL_BACKEND_URL ?? 'http://127.0.0.1:3010'
const frontendOrigin = `http://127.0.0.1:${process.env.E2E_REAL_FRONTEND_PORT ?? '4174'}`
const requiredUnitEnvironment = [
  'E2E_REAL_UNIT_A_REGISTRATION',
  'E2E_REAL_UNIT_A_PASSWORD',
  'E2E_REAL_UNIT_B_REGISTRATION',
  'E2E_REAL_UNIT_B_PASSWORD',
] as const
const env = {
  E2E_REAL_UNIT_A_REGISTRATION: process.env.E2E_REAL_UNIT_A_REGISTRATION,
  E2E_REAL_UNIT_A_PASSWORD: process.env.E2E_REAL_UNIT_A_PASSWORD,
  E2E_REAL_UNIT_B_REGISTRATION: process.env.E2E_REAL_UNIT_B_REGISTRATION,
  E2E_REAL_UNIT_B_PASSWORD: process.env.E2E_REAL_UNIT_B_PASSWORD,
  E2E_REAL_REQUIRE_ENV: process.env.E2E_REAL_REQUIRE_ENV,
}

function expectNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toMatch(/password|token|sessionId|cookie/i)
}

async function loginAndReadInventory(
  registration: string,
  password: string,
  ownUnitId: string,
  otherUnitId: string,
  foreignEquipmentId?: string,
): Promise<string | undefined> {
  const api = await requestFactory.newContext({
    baseURL: backendUrl,
    extraHTTPHeaders: { Origin: frontendOrigin },
  })

  const login = await api.post('/api/v1/auth/login', { data: { registration, password } })
  expect(login.status()).toBe(200)
  expectNoSecrets(await login.json())

  const session = await api.get('/api/v1/session')
  expect(session.status()).toBe(200)
  const sessionBody = await session.json()
  expect(sessionBody.role).toBe('unit_user')
  expect(sessionBody.unit?.id).toBe(ownUnitId)
  expectNoSecrets(sessionBody)

  const ownInventory = await api.get('/api/v1/inventory?page=1&pageSize=20&unitId=' + encodeURIComponent(ownUnitId))
  expect(ownInventory.status()).toBe(200)
  const ownBody = await ownInventory.json()
  expect(Array.isArray(ownBody.items)).toBe(true)
  for (const item of ownBody.items) expect(item.unit?.id).toBe(ownUnitId)
  expectNoSecrets(ownBody)

  const forgedInventory = await api.get('/api/v1/inventory?page=1&pageSize=20&unitId=' + encodeURIComponent(otherUnitId))
  expect([200, 404]).toContain(forgedInventory.status())
  if (forgedInventory.status() === 200) {
    const forgedBody = await forgedInventory.json()
    for (const item of forgedBody.items ?? []) expect(item.unit?.id).toBe(ownUnitId)
    expectNoSecrets(forgedBody)
  }

  const ownItemId = ownBody.items?.[0]?.id
  if (typeof foreignEquipmentId === 'string') {
    const foreignDetail = await api.get('/api/v1/inventory/' + encodeURIComponent(foreignEquipmentId))
    expect(foreignDetail.status()).toBe(404)
    expectNoSecrets(await foreignDetail.json())
  }

  const logout = await api.post('/api/v1/auth/logout')
  expect(logout.status()).toBe(204)
  const afterLogout = await api.get('/api/v1/session')
  expect(afterLogout.status()).toBe(401)
  expectNoSecrets(await afterLogout.json())
  await api.dispose()
  return typeof ownItemId === 'string' ? ownItemId : undefined
}

test.describe('isolamento real entre duas unidades demonstrativas', () => {
  assertRealBackendEnvironment(env, requiredUnitEnvironment)
  test.skip(
    shouldSkipRealBackendSmoke(env, requiredUnitEnvironment),
    `Ambiente real ausente: ${missingRealBackendEnvironment(env, requiredUnitEnvironment).join(', ')}`,
  )

  test('cada unidade autentica, consulta apenas seu escopo e revoga sua sessão', async () => {
    const unitAEquipmentId = await loginAndReadInventory(
      env.E2E_REAL_UNIT_A_REGISTRATION as string,
      env.E2E_REAL_UNIT_A_PASSWORD as string,
      REAL_HOMOLOGATION_UNITS.A,
      REAL_HOMOLOGATION_UNITS.B,
    )
    const unitBEquipmentId = await loginAndReadInventory(
      env.E2E_REAL_UNIT_B_REGISTRATION as string,
      env.E2E_REAL_UNIT_B_PASSWORD as string,
      REAL_HOMOLOGATION_UNITS.B,
      REAL_HOMOLOGATION_UNITS.A,
      unitAEquipmentId,
    )
    if (unitBEquipmentId) {
      await loginAndReadInventory(
        env.E2E_REAL_UNIT_A_REGISTRATION as string,
        env.E2E_REAL_UNIT_A_PASSWORD as string,
        REAL_HOMOLOGATION_UNITS.A,
        REAL_HOMOLOGATION_UNITS.B,
        unitBEquipmentId,
      )
    }
  })
})
