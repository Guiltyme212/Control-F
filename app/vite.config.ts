import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, appendFileSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const MAX_PAGES = 50
const UPSTREAM_FETCH_TIMEOUT_MS = 45000

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_FETCH_TIMEOUT_MS)

  try {
    return await fetch(url, { signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out after ${Math.round(UPSTREAM_FETCH_TIMEOUT_MS / 1000)}s while downloading the PDF`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// Cache downloaded + split PDFs so the client can fetch one chunk at a time
const pdfCache = new Map<string, { tmpDir: string; totalPages: number; chunkCount: number }>()

async function ensurePdfCached(targetUrl: string): Promise<{ tmpDir: string; totalPages: number; chunkCount: number }> {
  const existing = pdfCache.get(targetUrl)
  if (existing && existsSync(join(existing.tmpDir, 'source.pdf'))) return existing

  const tmp = mkdtempSync(join(tmpdir(), 'pdf-split-'))
  const srcPath = join(tmp, 'source.pdf')

  // Download via fetch
  const resp = await fetchWithTimeout(targetUrl)
  if (!resp.ok) throw new Error(`Failed to download PDF: ${resp.status}`)
  const pdfBytes = Buffer.from(await resp.arrayBuffer())
  writeFileSync(srcPath, pdfBytes)

  // Use pdfjs-dist for robust page counting (handles PDFs that pdf-lib can't)
  const pdfjsDoc = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise
  const totalPages = pdfjsDoc.numPages
  pdfjsDoc.destroy()

  // Try pdf-lib for splitting; fall back to raw file if it can't parse
  const chunkCount = Math.ceil(totalPages / MAX_PAGES)
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    for (let i = 0; i < chunkCount; i++) {
      const start = i * MAX_PAGES
      const end = Math.min(start + MAX_PAGES, totalPages)
      const chunkPath = join(tmp, `chunk_${i}.pdf`)
      if (totalPages <= MAX_PAGES) {
        writeFileSync(chunkPath, pdfBytes)
      } else {
        const chunkDoc = await PDFDocument.create()
        const indices = Array.from({ length: end - start }, (_, j) => start + j)
        const copiedPages = await chunkDoc.copyPages(pdfDoc, indices)
        for (const page of copiedPages) chunkDoc.addPage(page)
        writeFileSync(chunkPath, await chunkDoc.save())
      }
    }
  } catch {
    // pdf-lib can't split — store raw as single chunk (page count is still accurate)
    writeFileSync(join(tmp, 'chunk_0.pdf'), pdfBytes)
  }

  const entry = { tmpDir: tmp, totalPages, chunkCount }
  pdfCache.set(targetUrl, entry)
  return entry
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'pdf-proxy',
      configureServer(server) {
        const LOG_FILE = join(__dirname, 'extraction.log')
        // Append a run separator (don't clear — keep history across restarts)
        appendFileSync(LOG_FILE, `\n${'='.repeat(70)}\n  Server started: ${new Date().toISOString()}\n${'='.repeat(70)}\n`)

        server.middlewares.use(async (req, res, next) => {
          // --- /api/log → append to log file (UI-level logs) ---
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

          // --- /api/save-run-artifact → save structured extraction run artifacts ---
          if (req.url?.startsWith('/api/save-run-artifact') && req.method === 'POST') {
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              try {
                const artifact = JSON.parse(body)
                const runsDir = join(__dirname, 'evals', 'runs')
                mkdirSync(runsDir, { recursive: true })
                const ts = new Date().toISOString().replace(/[:.]/g, '-')
                const id = artifact.id || 'unknown'
                const filename = `${ts}-${id}.json`
                writeFileSync(join(runsDir, filename), JSON.stringify(artifact, null, 2))
              } catch { /* ignore */ }
              res.statusCode = 204
              res.end()
            })
            return
          }

          // --- /api/server-log → detailed behind-the-scenes logging ---
          if (req.url?.startsWith('/api/server-log') && req.method === 'POST') {
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              try {
                const payload = JSON.parse(body)
                const ts = new Date().toISOString()
                let lines = `\n[${ts}] ${payload.event || 'LOG'}\n`
                for (const [key, val] of Object.entries(payload)) {
                  if (key === 'event') continue
                  const display = typeof val === 'object' ? JSON.stringify(val) : String(val)
                  lines += `  ${key}: ${display}\n`
                }
                appendFileSync(LOG_FILE, lines)
              } catch { /* ignore */ }
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
              const info = await ensurePdfCached(targetUrl)
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
              const info = await ensurePdfCached(targetUrl)
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
              const info = await ensurePdfCached(targetUrl)
              const srcPath = join(info.tmpDir, 'source.pdf')
              const pdfBytes = readFileSync(srcPath)

              let buffer: Buffer
              try {
                const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
                // pages param is "1,5,12,30" (1-indexed) → convert to 0-indexed
                const pageIndices = pagesParam.split(',').map(p => parseInt(p, 10) - 1)
                const subsetDoc = await PDFDocument.create()
                const copiedPages = await subsetDoc.copyPages(pdfDoc, pageIndices)
                for (const page of copiedPages) subsetDoc.addPage(page)
                buffer = Buffer.from(await subsetDoc.save())
              } catch {
                // pdf-lib can't subset this PDF — return the whole file
                buffer = Buffer.from(pdfBytes)
              }

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
              const upstream = await fetchWithTimeout(targetUrl)
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
