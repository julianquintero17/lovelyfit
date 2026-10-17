import { getDB, insert, update, uuid } from './db'
import { isValidDayKey, type DayKey } from './dates'
import { parseGPX, simplify } from './gpx'
import { dayKey } from './dates'
import type { Activity, ActivityType, DailyMetric, MetricKind, Source } from './types'

export const dedupeKey = (date: DayKey, kind: MetricKind, source: Source) => `${date}|${kind}|${source}`

/**
 * Inserta o actualiza una métrica diaria. Misma fecha+tipo+fuente = mismo
 * registro (reimportar no duplica). Devuelve 'created' | 'updated' | 'same'.
 */
export async function upsertDailyMetric(date: DayKey, kind: MetricKind, value: number, source: Source) {
  if (!isValidDayKey(date)) throw new Error('Fecha inválida')
  if (!Number.isFinite(value) || value < 0) throw new Error('Valor inválido')
  const key = dedupeKey(date, kind, source)
  const existing = (await getDB().dailyMetrics.where('dedupeKey').equals(key).toArray()).find((m) => !m.deletedAt)
  if (existing) {
    if (existing.value === value) return 'same' as const
    await update<DailyMetric>('dailyMetrics', existing.id, { value })
    return 'updated' as const
  }
  await insert<DailyMetric>('dailyMetrics', { date, kind, value, source, dedupeKey: key })
  return 'created' as const
}

// Topes razonables para detectar un Atajo mal armado
const MAX: Record<MetricKind, number> = { steps: 100_000, active_kcal: 10_000, exercise_min: 1_440, resting_hr: 250 }

export interface ShortcutPayload {
  date: DayKey
  metrics: Partial<Record<MetricKind, number>>
}

/**
 * Lee parámetros enviados por un Atajo de iOS: /importar/?date=2026-10-17&steps=8123
 * Experimental: no está probado en el iPhone real todavía.
 */
export function parseShortcutParams(params: URLSearchParams): ShortcutPayload | { error: string } {
  const date = params.get('date') ?? ''
  if (!isValidDayKey(date)) return { error: 'Falta una fecha válida (date=AAAA-MM-DD).' }
  if (date > dayKey(new Date(Date.now() + 86400000))) return { error: 'La fecha está en el futuro: revisá el Atajo.' }
  const metrics: ShortcutPayload['metrics'] = {}
  const map: Record<string, MetricKind> = { steps: 'steps', active_kcal: 'active_kcal', exercise_min: 'exercise_min', resting_hr: 'resting_hr' }
  for (const [param, kind] of Object.entries(map)) {
    const raw = params.get(param)
    if (raw == null || raw === '') continue
    // Atajos puede mandar "8.123" o "8123,0" según la región
    const n = Number(raw.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > MAX[kind]) return { error: `Valor fuera de rango para ${param}: "${raw}"` }
    metrics[kind] = Math.round(n)
  }
  if (!Object.keys(metrics).length) return { error: 'No llegó ningún dato (steps, active_kcal, exercise_min, resting_hr).' }
  return { date, metrics }
}

export async function importGPX(xml: string, type: ActivityType): Promise<{ status: 'created' | 'duplicate'; activity: Activity }> {
  const t = parseGPX(xml)
  const existing = (await getDB().activities.where('[source+externalId]').equals(['gpx', t.externalId]).toArray()).find((a) => !a.deletedAt)
  if (existing) return { status: 'duplicate', activity: existing }
  const activity = await insert<Activity>('activities', {
    id: uuid(),
    date: t.startedAt ? dayKey(new Date(t.startedAt)) : dayKey(),
    type,
    startedAt: t.startedAt,
    durationMin: t.durationMin,
    distanceKm: t.distanceKm,
    avgHr: null,
    source: 'gpx',
    externalId: t.externalId,
    route: simplify(t.points),
    notes: '',
  })
  return { status: 'created', activity }
}
