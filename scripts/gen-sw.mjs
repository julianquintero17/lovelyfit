// Genera out/sw.js con la lista de archivos del build para que la app abra
// sin conexión después de la primera carga. Se ejecuta tras `next build`.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const OUT = new URL('../out/', import.meta.url).pathname
const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else files.push(p)
  }
}
walk(OUT)

const urls = []
const hash = createHash('sha256')
for (const p of files.sort()) {
  const rel = relative(OUT, p).split(sep).join('/')
  if (rel === 'sw.js' || rel.endsWith('.map') || rel === '404.html' || rel.startsWith('_not-found')) continue
  hash.update(rel).update(readFileSync(p))
  // index.html → URL de la ruta ("/entrenar/index.html" → "/entrenar/")
  urls.push('/' + rel.replace(/(^|\/)index\.html$/, '$1'))
}
const version = hash.digest('hex').slice(0, 12)

const sw = `// Generado por scripts/gen-sw.mjs — no editar a mano.
const CACHE = 'lovely-fit-${version}'
const PRECACHE = ${JSON.stringify(urls)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('lovely-fit-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase y otros: siempre red

  // Navegación: red primero (para tomar versiones nuevas), caché si no hay conexión.
  if (req.mode === 'navigate') {
    // Con señal mala (gimnasio, sótano) la red puede colgarse: a los 3 s se usa la copia local.
    const fromCache = async () => {
      const c = await caches.open(CACHE)
      let path = url.pathname
      if (!path.endsWith('/') && !path.includes('.')) path += '/'
      return (await c.match(path)) || (await c.match('/'))
    }
    e.respondWith(
      new Promise((resolve) => {
        let done = false
        const finish = (r) => { if (!done && r) { done = true; resolve(r) } }
        const timer = setTimeout(() => fromCache().then(finish), 3000)
        fetch(req)
          .then((r) => { clearTimeout(timer); finish(r) })
          .catch(async () => { clearTimeout(timer); finish((await fromCache()) || Response.error()) })
      }),
    )
    return
  }

  // Estáticos y payloads RSC: caché primero, ignorando ?_rsc=…
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true })
      if (hit) return hit
      try {
        const res = await fetch(req)
        if (res.ok && url.pathname.startsWith('/_next/static/')) c.put(req, res.clone())
        return res
      } catch (err) {
        return Response.error()
      }
    }),
  )
})
`
writeFileSync(join(OUT, 'sw.js'), sw)
console.log(`sw.js: ${urls.length} archivos precacheados (versión ${version})`)
