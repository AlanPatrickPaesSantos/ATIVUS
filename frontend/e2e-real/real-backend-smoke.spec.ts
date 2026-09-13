import { expect, request as requestFactory, test } from '@playwright/test'
import {
  assertRealBackendEnvironment,
  missingRealBackendEnvironment,
  shouldSkipRealBackendSmoke,
} from './realBackendEnvironment'

const backendUrl = process.env.E2E_REAL_BACKEND_URL ?? 'http://127.0.0.1:3010'
const frontendOrigin = `http://127.0.0.1:${process.env.E2E_REAL_FRONTEND_PORT ?? '4174'}`
const requiredEnvironment: Record<string, string | undefined> = {
  E2E_REAL_DITEL_REGISTRATION: process.env.E2E_REAL_DITEL_REGISTRATION,
  E2E_REAL_DITEL_PASSWORD: process.env.E2E_REAL_DITEL_PASSWORD,
  E2E_REAL_UNIT_REGISTRATION: process.env.E2E_REAL_UNIT_REGISTRATION,
  E2E_REAL_UNIT_PASSWORD: process.env.E2E_REAL_UNIT_PASSWORD,
  E2E_REAL_REQUIRE_ENV: process.env.E2E_REAL_REQUIRE_ENV,
}

function expectNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain('passwordHash')
  expect(serialized).not.toContain('tokenDigest')
  expect(serialized).not.toContain('sessionId')
}

test.describe('real backend smoke', () => {
  assertRealBackendEnvironment(requiredEnvironment)
  test.skip(shouldSkipRealBackendSmoke(requiredEnvironment), `Missing real-backend E2E env: ${missingRealBackendEnvironment(requiredEnvironment).join(', ')}`)

  test('validates health, readiness, DITEL cookie login, unit 403 and response secrecy', async ({ page }) => {
    const ditelContext = await requestFactory.newContext({
      baseURL: backendUrl,
      extraHTTPHeaders: { Origin: frontendOrigin },
    })
    const unitContext = await requestFactory.newContext({
      baseURL: backendUrl,
      extraHTTPHeaders: { Origin: frontendOrigin },
    })

    const health = await ditelContext.get('/api/v1/health')
    expect(health.status()).toBe(200)
    expectNoSecrets(await health.json())

    const readiness = await ditelContext.get('/api/v1/readiness')
    expect(readiness.status()).toBe(200)
    expectNoSecrets(await readiness.json())

    const ditelLogin = await ditelContext.post('/api/v1/auth/login', {
      data: {
        registration: requiredEnvironment.E2E_REAL_DITEL_REGISTRATION,
        password: requiredEnvironment.E2E_REAL_DITEL_PASSWORD,
      },
    })
    expect(ditelLogin.status()).toBe(200)
    expect(ditelLogin.headers()['set-cookie']).toContain('sigat_session=')
    const ditelBody = await ditelLogin.json()
    expect(ditelBody.role).toBe('ditel_admin')
    expectNoSecrets(ditelBody)

    const session = await ditelContext.get('/api/v1/session')
    expect(session.status()).toBe(200)
    expectNoSecrets(await session.json())

    await page.goto('/login')
    await page.getByLabel('Matrícula').fill(requiredEnvironment.E2E_REAL_DITEL_REGISTRATION as string)
    await page.getByLabel('Senha').fill(requiredEnvironment.E2E_REAL_DITEL_PASSWORD as string)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByRole('heading', { name: 'Painel estadual' })).toBeVisible()
    await page.getByRole('link', { name: 'Administração', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Administração DITEL' })).toBeVisible()

    const unitLogin = await unitContext.post('/api/v1/auth/login', {
      data: {
        registration: requiredEnvironment.E2E_REAL_UNIT_REGISTRATION,
        password: requiredEnvironment.E2E_REAL_UNIT_PASSWORD,
      },
    })
    expect(unitLogin.status()).toBe(200)
    expect(unitLogin.headers()['set-cookie']).toContain('sigat_session=')
    expectNoSecrets(await unitLogin.json())

    const forbiddenAdminList = await unitContext.get('/api/v1/admin/users')
    expect(forbiddenAdminList.status()).toBe(403)
    expectNoSecrets(await forbiddenAdminList.json())

    await ditelContext.dispose()
    await unitContext.dispose()
  })
})
