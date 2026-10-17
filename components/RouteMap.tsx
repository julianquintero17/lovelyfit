'use client'

/**
 * Dibuja un recorrido con sus coordenadas reales, sin mapa de fondo:
 * así no se envía la ubicación a ningún servicio de mapas de terceros.
 */
export function RouteMap({ route }: { route: [number, number][] }) {
  if (route.length < 2) return null
  const lat0 = route.reduce((a, p) => a + p[0], 0) / route.length
  const k = Math.cos((lat0 * Math.PI) / 180)
  const xs = route.map((p) => p[1] * k)
  const ys = route.map((p) => -p[0])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const W = 320, H = 240, pad = 16
  const s = Math.min((W - 2 * pad) / (maxX - minX || 1e-9), (H - 2 * pad) / (maxY - minY || 1e-9))
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2
  const pt = (i: number) => [ox + (xs[i] - minX) * s, oy + (ys[i] - minY) * s] as const
  const d = route.map((_, i) => `${i ? 'L' : 'M'}${pt(i)[0].toFixed(1)},${pt(i)[1].toFixed(1)}`).join(' ')
  const [sx, sy] = pt(0)
  const [ex, ey] = pt(route.length - 1)
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Recorrido de la actividad" className="deco-grid" style={{ borderRadius: 12, border: '1px solid var(--stone)' }}>
        <path d={d} fill="none" stroke="var(--lab)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={sx} cy={sy} r="6" fill="var(--surface)" stroke="var(--lab)" strokeWidth="2.5" />
        <circle cx={ex} cy={ey} r="6" fill="var(--clay)" stroke="var(--surface)" strokeWidth="2" />
      </svg>
      <figcaption className="tiny muted" style={{ marginTop: 4 }}>Inicio ○ · Fin ● · Sin mapa de fondo para no compartir tu ubicación.</figcaption>
    </figure>
  )
}
