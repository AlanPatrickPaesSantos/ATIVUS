import { afterEach, describe, expect, it, vi } from 'vitest'

const start = vi.fn()

vi.mock('msw/browser', () => ({
  setupWorker: vi.fn(() => ({ start })),
}))

describe('browser MSW bootstrap', () => {
  afterEach(() => {
    start.mockClear()
    vi.unstubAllEnvs()
  })

  it('does not start the worker when VITE_ENABLE_MSW is false', async () => {
    vi.stubEnv('VITE_ENABLE_MSW', 'false')
    vi.resetModules()

    const { enableMocking } = await import('./browser')
    await enableMocking()

    expect(start).not.toHaveBeenCalled()
  })

  it('starts the worker only when VITE_ENABLE_MSW is true in dev', async () => {
    vi.stubEnv('VITE_ENABLE_MSW', 'true')
    vi.resetModules()

    const { enableMocking } = await import('./browser')
    await enableMocking()

    expect(start).toHaveBeenCalledWith({ onUnhandledRequest: 'bypass' })
  })
})
