import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const MAX_PAGES = 95

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'pdf-proxy',
      configureServer(server) {
        // Simple proxy: download a PDF, return raw bytes
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/proxy-pdf-chunks') && !req.url?.startsWith('/proxy-pdf')) return next()

          const parsed = new URL(req.url, 'http://localhost')
          const targetUrl = parsed.searchParams.get('url')
          if (!targetUrl) {
            res.statusCode = 400
            res.end('Missing url parameter')
            return
          }

          // If it's the simple proxy endpoint, just return raw bytes
          if (req.url.startsWith('/proxy-pdf') && !req.url.startsWith('/proxy-pdf-chunks')) {
            try {
              const upstream = await fetch(targetUrl)
              if (!upstream.ok) {
                res.statusCode = upstream.status
                res.end(`Upstream error: ${upstream.status}`)
                return
              }
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

          // Chunked endpoint: download PDF, split with qpdf if needed, return JSON
          const tmp = mkdtempSync(join(tmpdir(), 'pdf-split-'))
          const srcPath = join(tmp, 'source.pdf')

          try {
            // Download
            const upstream = await fetch(targetUrl)
            if (!upstream.ok) {
              res.statusCode = upstream.status
              res.end(`Upstream error: ${upstream.status}`)
              return
            }
            const buffer = Buffer.from(await upstream.arrayBuffer())
            writeFileSync(srcPath, buffer)

            // Count pages with qpdf
            const totalPages = parseInt(
              execSync(`qpdf --show-npages "${srcPath}"`, { encoding: 'utf8' }).trim(),
              10,
            )

            if (totalPages <= MAX_PAGES) {
              // No splitting needed
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                chunks: [{ base64: buffer.toString('base64'), pageOffset: 0, totalPages }],
              }))
              return
            }

            // Split into chunks
            const chunks: { base64: string; pageOffset: number; totalPages: number }[] = []
            for (let start = 1; start <= totalPages; start += MAX_PAGES) {
              const end = Math.min(start + MAX_PAGES - 1, totalPages)
              const chunkPath = join(tmp, `chunk_${start}.pdf`)
              execSync(
                `qpdf "${srcPath}" --pages . ${start}-${end} -- "${chunkPath}"`,
                { encoding: 'utf8' },
              )
              const chunkBuffer = readFileSync(chunkPath)
              chunks.push({
                base64: chunkBuffer.toString('base64'),
                pageOffset: start - 1,
                totalPages,
              })
            }

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ chunks }))
          } catch (err: unknown) {
            res.statusCode = 500
            res.end(`PDF processing failed: ${err instanceof Error ? err.message : 'unknown'}`)
          } finally {
            try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
          }
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
