// Servidor estático mínimo para probar el build (out/) localmente.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = new URL('../out/', import.meta.url).pathname
const port = Number(process.env.PORT || 3000)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/x-component' }

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(root, p)
  try {
    let s = await stat(file).catch(() => null)
    if (s?.isDirectory()) file = join(file, 'index.html')
    else if (!s) {
      const alt = join(root, p + '/index.html')
      if (await stat(alt).catch(() => null)) { res.writeHead(308, { Location: p + '/' }); return res.end() }
      file = join(root, '404.html'); res.statusCode = 404
    }
    const body = await readFile(file)
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    if (file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache')
    res.end(body)
  } catch (e) { res.statusCode = 500; res.end(String(e)) }
}).listen(port, () => console.log(`http://localhost:${port}`))
