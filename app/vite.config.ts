import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { readFileSync, mkdtempSync, existsSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const MAX_PAGES = 50

// Cache downloaded + split PDFs so the client can fetch one chunk at a time
const pdfCache = new Map<string, { tmpDir: string; totalPages: number; chunkCount: number }>()

function ensurePdfCached(targetUrl: string): { tmpDir: string; totalPages: number; chunkCount: number } {
  const existing = pdfCache.get(targetUrl)
  if (existing && existsSync(join(existing.tmpDir, 'source.pdf'))) return existing

  const tmp = mkdtempSync(join(tmpdir(), 'pdf-split-'))
  const srcPath = join(tmp, 'source.pdf')

  // Download synchronously via curl (simpler for cache setup)
  execSync(`curl -sL -o "${srcPath}" "${targetUrl}"`, { timeout: 60000 })

  const totalPages = parseInt(
    execSync(`qpdf --show-npages "${srcPath}"`, { encoding: 'utf8' }).trim(),
    10,
  )

  // Pre-split into chunks
  const chunkCount = Math.ceil(totalPages / MAX_PAGES)
  for (let i = 0; i < chunkCount; i++) {
    const start = i * MAX_PAGES + 1
    const end = Math.min(start + MAX_PAGES - 1, totalPages)
    const chunkPath = join(tmp, `chunk_${i}.pdf`)
    if (totalPages <= MAX_PAGES) {
      // Single chunk — just copy the source
      execSync(`cp "${srcPath}" "${chunkPath}"`)
    } else {
      execSync(`qpdf "${srcPath}" --pages . ${start}-${end} -- "${chunkPath}"`)
    }
  }

  const entry = { tmpDir: tmp, totalPages, chunkCount }
  pdfCache.set(targetUrl, entry)
  return entry
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'pdf-proxy',
      configureServer(server) {
        const LOG_FILE = join(tmpdir(), 'controlf-extraction.log')
        // Clear log on server start
        writeFileSync(LOG_FILE, `--- Control F Extraction Log (${new Date().toISOString()}) ---\n`)

        server.middlewares.use(async (req, res, next) => {
          // --- /api/log → append to log file ---
          if (req.url?.startsWith('/api/log') && req.method === 'POST') {
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              try {
                const { message, status } = JSON.parse(body)
                const prefix = status === 'done' ? '✓' : status === 'error' ? '✗' : '›'
                const line = `${new Date().toISOString().slice(11, 19)} ${prefix} ${message}\n`
                appendFileSync(LOG_FILE, line)
              } catch { /* ignore bad json */ }
              res.statusCode = 204
              res.end()
            })
            return
          }

          // --- /proxy-pdf-info?url=... → { totalPages, chunkCount } ---
          if (req.url?.startsWith('/proxy-pdf-info')) {
            const parsed = new URL(req.url, 'http://localhost')
            const targetUrl = parsed.searchParams.get('url')
            if (!targetUrl) { res.statusCode = 400; res.end('Missing url'); return }

            try {
              const info = ensurePdfCached(targetUrl)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ totalPages: info.totalPages, chunkCount: info.chunkCount }))
            } catch (err: unknown) {
              res.statusCode = 500
              res.end(`PDF processing failed: ${err instanceof Error ? err.message : 'unknown'}`)
            }
            return
          }

          // --- /proxy-pdf-chunk?url=...&chunk=0 → raw PDF bytes for that chunk ---
          if (req.url?.startsWith('/proxy-pdf-chunk')) {
            const parsed = new URL(req.url, 'http://localhost')
            const targetUrl = parsed.searchParams.get('url')
            const chunkIdx = parseInt(parsed.searchParams.get('chunk') || '0', 10)
            if (!targetUrl) { res.statusCode = 400; res.end('Missing url'); return }

            try {
              const info = ensurePdfCached(targetUrl)
              const chunkPath = join(info.tmpDir, `chunk_${chunkIdx}.pdf`)
              if (!existsSync(chunkPath)) {
                res.statusCode = 404
                res.end(`Chunk ${chunkIdx} not found`)
                return
              }
              const buffer = readFileSync(chunkPath)
              res.setHeader('Content-Type', 'application/pdf')
              res.setHeader('Content-Length', buffer.length.toString())
              res.end(buffer)
            } catch (err: unknown) {
              res.statusCode = 500
              res.end(`PDF chunk fetch failed: ${err instanceof Error ? err.message : 'unknown'}`)
            }
            return
          }

          // --- /proxy-pdf-subset?url=...&pages=1,5,12,30 → subset PDF with only those pages ---
          if (req.url?.startsWith('/proxy-pdf-subset')) {
            const parsed = new URL(req.url, 'http://localhost')
            const targetUrl = parsed.searchParams.get('url')
            const pagesParam = parsed.searchParams.get('pages') || ''
            if (!targetUrl || !pagesParam) { res.statusCode = 400; res.end('Missing url or pages'); return }

            try {
              const info = ensurePdfCached(targetUrl)
              const srcPath = join(info.tmpDir, 'source.pdf')
              const subsetPath = join(info.tmpDir, `subset_${pagesParam.replace(/,/g, '_').slice(0, 60)}.pdf`)

              // qpdf page ranges: "1,5,12,30" → "1,5,12,30"
              execSync(
                `qpdf "${srcPath}" --pages . ${pagesParam} -- "${subsetPath}"`,
                { encoding: 'utf8' },
              )
              const buffer = readFileSync(subsetPath)
              res.setHeader('Content-Type', 'application/pdf')
              res.setHeader('Content-Length', buffer.length.toString())
              res.end(buffer)
            } catch (err: unknown) {
              res.statusCode = 500
              res.end(`PDF subset failed: ${err instanceof Error ? err.message : 'unknown'}`)
            }
            return
          }

          // --- /proxy-pdf?url=... → simple raw PDF proxy (no splitting) ---
          if (req.url?.startsWith('/proxy-pdf')) {
            const parsed = new URL(req.url, 'http://localhost')
            const targetUrl = parsed.searchParams.get('url')
            if (!targetUrl) { res.statusCode = 400; res.end('Missing url'); return }

            try {
              const upstream = await fetch(targetUrl)
              if (!upstream.ok) { res.statusCode = upstream.status; res.end(`Upstream error: ${upstream.status}`); return }
              const buffer = Buffer.from(await upstream.arrayBuffer())
              res.setHeader('Content-Type', 'application/pdf')
              res.setHeader('Content-Length', buffer.length.toString())
              res.end(buffer)
            } catch (err: unknown) {
              res.statusCode = 502
              res.end(`Failed to fetch PDF: ${err instanceof Error ? err.message : 'unknown'}`)
            }
            return
          }

          next()
        })
      },
    },
  ],
  server: {
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      },
    },
  },
})
