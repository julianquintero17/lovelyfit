// Lectura mínima de GPX (exportado por GloryFitPro u otra app, si lo permite).
// Solo usa coordenadas reales del archivo; nunca inventa una ruta.

export interface ParsedTrack {
  points: [number, number][]
  times: (string | null)[]
  startedAt: string | null
  durationMin: number | null
  distanceKm: number
  externalId: string
}

export function parseGPX(xml: string): ParsedTrack {
  const points: [number, number][] = []
  const times: (string | null)[] = []
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? m[3] ?? ''
    const lat = Number(/lat\s*=\s*["']([-\d.]+)["']/.exec(attrs)?.[1])
    const lon = Number(/lon\s*=\s*["']([-\d.]+)["']/.exec(attrs)?.[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    points.push([lat, lon])
    times.push(/<time>([^<]+)<\/time>/.exec(m[2] ?? '')?.[1]?.trim() ?? null)
  }
  if (points.length < 2) throw new Error('El archivo no tiene un recorrido con coordenadas.')
  let dist = 0
  for (let i = 1; i < points.length; i++) dist += haversineKm(points[i - 1], points[i])
  const valid = times.filter((t): t is string => !!t && !Number.isNaN(Date.parse(t)))
  const startedAt = valid.length ? new Date(valid[0]).toISOString() : null
  const durationMin = valid.length >= 2 ? Math.round((Date.parse(valid[valid.length - 1]) - Date.parse(valid[0])) / 60000) : null
  // Id externo estable para no importar dos veces el mismo archivo
  const externalId = `gpx:${startedAt ?? 'sin-hora'}:${points.length}:${points[0][0].toFixed(5)},${points[0][1].toFixed(5)}`
  return { points, times, startedAt, durationMin, distanceKm: Math.round(dist * 100) / 100, externalId }
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Reduce puntos para guardar/dibujar (mantiene inicio y fin). */
export function simplify(points: [number, number][], max = 600): [number, number][] {
  if (points.length <= max) return points
  const step = (points.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)])
}
