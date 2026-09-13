import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

async function readProjectFile(path: string) {
  return await readFile(new URL(path, import.meta.url), 'utf8')
}

describe('real backend Playwright configuration', () => {
  it('keeps the MSW E2E command separate from the guarded real-backend command', async () => {
    const packageJson = JSON.parse(await readProjectFile('./package.json')) as { scripts: Record<string, string> }

    expect(packageJson.scripts.test).toContain('--exclude e2e-real/**')
    expect(packageJson.scripts['test:e2e']).toBe('playwright test')
    expect(packageJson.scripts['test:e2e:real']).toBe('playwright test -c playwright.real-backend.config.ts')
  })

  it('documents an explicit non-MSW real backend smoke flow without hardcoded seed passwords', async () => {
    const config = await readProjectFile('./playwright.real-backend.config.ts')
    const spec = await readProjectFile('./e2e-real/real-backend-smoke.spec.ts')

    expect(config).toContain('E2E_REAL_BACKEND_URL')
    expect(config).toContain("VITE_ENABLE_MSW: 'false'")
    expect(config).not.toContain("VITE_ENABLE_MSW: 'true'")
    expect(config).not.toMatch(/sigat-(unit|ditel)|senha-segura|homolog-password/)

    expect(spec).toContain('E2E_REAL_DITEL_REGISTRATION')
    expect(spec).toContain('E2E_REAL_DITEL_PASSWORD')
    expect(spec).toContain('E2E_REAL_UNIT_REGISTRATION')
    expect(spec).toContain('E2E_REAL_UNIT_PASSWORD')
    expect(spec).toContain('E2E_REAL_REQUIRE_ENV')
    expect(spec).toContain('assertRealBackendEnvironment')
    expect(spec).toContain('shouldSkipRealBackendSmoke')
    expect(spec).toContain('/api/v1/health')
    expect(spec).toContain('/api/v1/readiness')
    expect(spec).toContain('/api/v1/admin/users')
    expect(spec).toContain('403')
    expect(spec).toContain('passwordHash')
    expect(spec).toContain('tokenDigest')
    expect(spec).toContain('sessionId')
    expect(spec).not.toMatch(/sigat-(unit|ditel)|senha-segura|homolog-password/)
  })
})
