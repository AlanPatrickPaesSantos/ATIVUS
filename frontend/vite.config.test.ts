import type { Plugin, UserConfig } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function resolveConfig(command: 'serve' | 'build' = 'serve', mode = 'development'): Promise<UserConfig> {
  vi.resetModules()
  const { default: viteConfig } = await import('./vite.config')

  if (typeof viteConfig === 'function') {
    return await viteConfig({ command, mode })
  }

  return viteConfig
}

describe('vite dev proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('proxies API calls to the local backend by default in development', async () => {
    const config = await resolveConfig()

    expect(config.server?.proxy?.['/api/v1']).toMatchObject({
      target: 'http://localhost:3010',
      changeOrigin: true,
      secure: false,
    })
  })

  it('allows overriding the backend target without changing API contracts', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'http://127.0.0.1:4010')

    const config = await resolveConfig()

    expect(config.server?.proxy?.['/api/v1']).toMatchObject({
      target: 'http://127.0.0.1:4010',
    })
  })

  it('does not add a dev proxy to production builds', async () => {
    const config = await resolveConfig('build', 'production')

    expect(config.server).toBeUndefined()
  })

  it('keeps public assets available during production builds', async () => {
    const config = await resolveConfig('build', 'production')

    expect(config.publicDir).toBe('public')
  })

  it('removes only the MSW worker from production build output', async () => {
    const config = await resolveConfig('build', 'production')
    const plugins = Array.isArray(config.plugins) ? config.plugins.flat() : []
    const mswPlugin = plugins.find((plugin): plugin is Plugin => plugin?.name === 'exclude-msw-worker-from-build')

    expect(mswPlugin?.closeBundle).toEqual(expect.any(Function))
  })
})
