import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { stat, readFile } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Server estatico para SPAs (React/Vite build): serve o `dist` e faz fallback
// de rotas sem extensao (deep links /dashboard, /relatorios, ...) para index.html.
// Zero dependencias (http nativo). Nao serve /api/* (delegado ao backend).

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
}

function contentType(p: string): string {
  return MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'
}

export interface SpaStaticServerOptions {
  rootDir: string
  /** arquivo de fallback SPA (padrao: index.html na raiz do dist) */
  indexFile?: string
}

export function createSpaStaticServer(options: SpaStaticServerOptions): Server {
  const root = options.rootDir
  const indexFile = options.indexFile ?? 'index.html'

  const resolveSafe = (urlPath: string): string | null => {
    // So paths relativos; bloqueia traversal (..) e null bytes
    const decoded = decodeURIComponent(urlPath)
    if (decoded.includes('\0')) return null
    const normalized = normalize(decoded).replace(/^([/\\])+/, '')
    const filePath = join(root, normalized)
    if (!filePath.startsWith(root)) return null
    return filePath
  }

  const send = async (res: ServerResponse, status: number, body: string | Buffer, type: string): Promise<void> => {
    res.writeHead(status, {
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': status === 200 && /\/assets\//.test(res.req.url ?? '') ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(body)
  }

  const serveFile = async (res: ServerResponse, filePath: string): Promise<boolean> => {
    try {
      const info = await stat(filePath)
      if (!info.isFile()) return false
      const body = await readFile(filePath)
      await send(res, 200, body, contentType(filePath))
      return true
    } catch {
      return false
    }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const urlPath = (req.url ?? '/').split('?')[0]

    // Health simples para o Render (evita 404 na checagem de saude)
    if (urlPath === '/-/health' || urlPath === '/healthz') {
      await send(res, 200, 'ok', 'text/plain; charset=utf-8')
      return
    }

    // API nunca cai no fallback SPA: se chegar aqui no web service, 404 real
    if (urlPath.startsWith('/api/')) {
      await send(res, 404, 'Not Found', 'text/plain; charset=utf-8')
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      await send(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8')
      return
    }

    const filePath = resolveSafe(urlPath)
    if (filePath) {
      const served = await serveFile(res, filePath)
      if (served) return

      // Caminho COM extensao mas inexistente -> 404 real (nao cai no SPA)
      if (extname(urlPath) !== '') {
        await send(res, 404, 'Not Found', 'text/plain; charset=utf-8')
        return
      }
    }

    // Rota SPA profunda (sem extensao): fallback para index.html
    const indexPath = join(root, indexFile)
    const servedIndex = await serveFile(res, indexPath)
    if (!servedIndex) {
      await send(res, 404, 'Not Found', 'text/plain; charset=utf-8')
    }
  })

  return server
}

// Execucao direta: node spaStaticServer.js (ou `npm run start:spa`)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const distDir = process.env.DIST_DIR ?? join(process.cwd(), 'dist')
  const port = Number(process.env.PORT ?? 10000)
  const server = createSpaStaticServer({ rootDir: distDir })
  server.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`[spa-static] servindo ${distDir} em http://0.0.0.0:${port}`)
  })
}