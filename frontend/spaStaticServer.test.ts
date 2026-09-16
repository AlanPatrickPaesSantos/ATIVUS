import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSpaStaticServer } from './spaStaticServer.js'
import type { Server } from 'node:http'

describe('spaStaticServer — serve o dist com fallback SPA', () => {
  let root: string
  let server: Server
  let base: string

  beforeAll(async () => {
    // Monta um dist minimo: index.html, asset, subpasta
    root = mkdtempSync(join(tmpdir(), 'sigat-dist-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>SIGAT</title><div id=root></div>')
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log("app")')
    mkdirSync(join(root, 'images'))
    writeFileSync(join(root, 'images', 'logo.png'), 'PNGDATA')

    const { createSpaStaticServer } = await import('./spaStaticServer.js')
    server = createSpaStaticServer({ rootDir: root })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('sem endereco')
    base = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  async function get(path: string): Promise<{ status: number; body: string; type: string }> {
    const res = await fetch(base + path)
    return { status: res.status, body: await res.text(), type: res.headers.get('content-type') ?? '' }
  }

  it('raiz serve o index.html', async () => {
    const r = await get('/')
    expect(r.status).toBe(200)
    expect(r.body).toContain('<div id=root>')
    expect(r.type).toContain('text/html')
  })

  it('rota SPA profunda (sem extensao) cai no fallback index.html', async () => {
    for (const p of ['/dashboard', '/inventario', '/chamados', '/movimentacoes', '/relatorios', '/administracao', '/login']) {
      const r = await get(p)
      expect(r.status).toBe(200)
      expect(r.body).toContain('<div id=root>')
      expect(r.type).toContain('text/html')
    }
  })

  it('asset com extensao e servido com content-type correto', async () => {
    const r = await get('/assets/app.js')
    expect(r.status).toBe(200)
    expect(r.body).toBe('console.log("app")')
    expect(r.type).toContain('javascript')
  })

  it('arquivo em subpasta e servido', async () => {
    const r = await get('/images/logo.png')
    expect(r.status).toBe(200)
    expect(r.type).toContain('image/png')
  })

  it('caminho inexistente COM extensao -> 404 (nao cai no SPA)', async () => {
    const r = await get('/assets/nao-existe.js')
    expect(r.status).toBe(404)
  })

  it('rota API /api/v1/* nao e mascarada pelo fallback (404 real)', async () => {
    // O frontend nao delega /api — se chegar aqui, deve 404 em vez de index.html
    const r = await get('/api/v1/health')
    expect(r.status).toBe(404)
  })

  it('health check basico em /-/health', async () => {
    const r = await get('/-/health')
    expect(r.status).toBe(200)
    expect(r.body).toContain('ok')
  })
})