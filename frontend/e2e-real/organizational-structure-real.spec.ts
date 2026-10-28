import { expect, request as requestFactory, test } from '@playwright/test'
import {
  assertRealBackendEnvironment,
  missingRealBackendEnvironment,
  shouldSkipRealBackendSmoke,
} from './realBackendEnvironment'

const backendUrl = process.env.E2E_REAL_BACKEND_URL ?? 'http://127.0.0.1:3010'
const frontendOrigin = `http://127.0.0.1:${process.env.E2E_REAL_FRONTEND_PORT ?? '4173'}`
const env = {
  E2E_REAL_DITEL_REGISTRATION: process.env.E2E_REAL_DITEL_REGISTRATION,
  E2E_REAL_DITEL_PASSWORD: process.env.E2E_REAL_DITEL_PASSWORD,
  E2E_REAL_UNIT_REGISTRATION: process.env.E2E_REAL_UNIT_REGISTRATION,
  E2E_REAL_UNIT_PASSWORD: process.env.E2E_REAL_UNIT_PASSWORD,
  E2E_REAL_UNIT_ID: process.env.E2E_REAL_UNIT_ID,
  E2E_REAL_REQUIRE_ENV: process.env.E2E_REAL_REQUIRE_ENV,
}

function expectNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toMatch(/passwordHash|tokenDigest|sessionId/i)
}

test.describe('estrutura estadual real', () => {
  assertRealBackendEnvironment(env)
  test.skip(shouldSkipRealBackendSmoke(env), `Ambiente real ausente: ${missingRealBackendEnvironment(env).join(', ')}`)

  test('DITEL consulta APIs, hierarquia, filtros e o lote demonstrativo', async ({ page }) => {
    const api = await requestFactory.newContext({ baseURL: backendUrl, extraHTTPHeaders: { Origin: frontendOrigin } })
    const login = await api.post('/api/v1/auth/login', { data: { registration: env.E2E_REAL_DITEL_REGISTRATION, password: env.E2E_REAL_DITEL_PASSWORD } })
    expect(login.status()).toBe(200)
    expectNoSecrets(await login.json())

    const list = await api.get('/api/v1/admin/organizational-structure?page=1&pageSize=100')
    expect(list.status()).toBe(200)
    const body = await list.json()
    expect(body.total).toBe(101)
    expect(body.items.filter((item: { kind: string }) => item.kind === 'intermediate_command')).toHaveLength(20)
    expect(body.items.filter((item: { kind: string }) => item.kind !== 'intermediate_command')).toHaveLength(81)
    expectNoSecrets(body)

    const commands = body.items.filter((item: { kind: string }) => item.kind === 'intermediate_command')
    let equipmentTotal = 0
    for (const command of commands) {
      const indicators = await api.get(`/api/v1/admin/organizational-structure/${encodeURIComponent(command.id)}/indicators`)
      expect(indicators.status()).toBe(200)
      const indicatorBody = await indicators.json()
      equipmentTotal += indicatorBody.indicators.equipment.total
      expect(indicatorBody.indicators.equipment.total).toBeGreaterThanOrEqual(0)
      expectNoSecrets(indicatorBody)
    }
    expect(equipmentTotal).toBe(1151)

    const filtered = await api.get('/api/v1/admin/organizational-structure?page=1&pageSize=20&kind=bpm&verificationStatus=confirmed')
    expect(filtered.status()).toBe(200)
    expect((await filtered.json()).items).not.toHaveLength(0)

    await page.goto('/login')
    await page.getByLabel('Matrícula').fill(env.E2E_REAL_DITEL_REGISTRATION as string)
    await page.getByLabel('Senha').fill(env.E2E_REAL_DITEL_PASSWORD as string)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.goto('/estrutura-estadual')
    await expect(page.getByRole('heading', { name: 'Estrutura estadual' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aplicar filtros' })).toBeVisible()

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
    }
    await api.dispose()
  })

  test('unit_user continua limitado à própria unidade', async () => {
    const api = await requestFactory.newContext({ baseURL: backendUrl, extraHTTPHeaders: { Origin: frontendOrigin } })
    const login = await api.post('/api/v1/auth/login', { data: { registration: env.E2E_REAL_UNIT_REGISTRATION, password: env.E2E_REAL_UNIT_PASSWORD } })
    expect(login.status()).toBe(200)
    const forbidden = await api.get('/api/v1/admin/organizational-structure')
    expect(forbidden.status()).toBe(403)
    const inventory = await api.get('/api/v1/inventory?page=1&pageSize=20&unitId=pmpa:unit:other')
    expect([200, 404]).toContain(inventory.status())
    if (inventory.status() === 200) {
      const body = await inventory.json()
      for (const item of body.items ?? []) expect(item.unit?.id).toBe(env.E2E_REAL_UNIT_ID ?? 'hml-unit')
    }
    await api.dispose()
  })
})
