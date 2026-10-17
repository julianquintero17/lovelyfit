import { Unzip, UnzipInflate } from 'fflate'
import { getDB, insert, nowISO, uuid } from './db'
import { dedupeKey } from './imports'
import type { Activity, ActivityType, DailyMetric, Measurement, MetricKind } from './types'

// Importa la exportación completa de Apple Salud (exportar.zip → export.xml) en el propio
// dispositivo. Se lee por partes: el XML puede pesar cientos de MB.
// Reglas: varias fuentes del mismo día (iPhone + reloj) NO se suman; se toma la mayor.

type Day = string // YYYY-MM-DD

interface WorkoutRow {
  day: Day // fecha local del dispositivo
  start: string // ISO
  type: string // Walking, Running, Cycling…
  minutes: number | null
  km: number | null
  kcal: number | null
}

export interface HealthSummary {
  days: number
  steps: number
  activeKcal: number
  exerciseMin: number
  restingHr: number
  weights: number
  workouts: number
  from: Day | null
  to: Day | null
}

const QTY: Record<string, MetricKind | 'weight'> = {
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'active_kcal',
  HKQuantityTypeIdentifierAppleExerciseTime: 'exercise_min',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting_hr',
  HKQuantityTypeIdentifierBodyMass: 'weight',
}

/** Número de un atributo; NaN si falta (Number(null) daría 0, que es un dato falso). */
const num = (v: string | null) => (v == null || v === '' ? NaN : Number(v))

// Expresiones precompiladas: el XML puede tener millones de registros
const ATTR_RE = new Map<string, RegExp>()
const attr = (tag: string, name: string) => {
  let re = ATTR_RE.get(name)
  if (!re) ATTR_RE.set(name, (re = new RegExp(`\\s${name}="([^"]*)"`)))
  const m = re.exec(tag)
  return m ? m[1] : null
}

/** "2026-10-16 08:10:00 -0300" → ISO UTC */
export function healthDateToISO(s: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s.trim())
  return m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`).toISOString() : new Date(s).toISOString()
}

/** Agrega registros a medida que llega el texto. Independiente del zip para poder probarlo. */
export class HealthAggregator {
  private buf = ''
  /** kind → día → fuente → suma */
  private sums = new Map<MetricKind, Map<Day, Map<string, number>>>()
  private hr = new Map<Day, { s: number; n: number }>()
  private weights = new Map<Day, number>()
  private workouts: WorkoutRow[] = []
  constructor(private since: Day | null = null) {}

  feed(text: string) {
    this.buf += text
    // Recorre los elementos en orden; se detiene en el primero que todavía no llegó completo.
    const start = /<(Record|Workout)[\s>]/g
    const full = /<Record\b[^>]*?\/>|<Record\b[^>]*?>[\s\S]*?<\/Record>|<Workout\b[^>]*?\/>|<Workout\b[^>]*?>[\s\S]*?<\/Workout>/y
    let keep = -1
    let m: RegExpExecArray | null
    while ((m = start.exec(this.buf))) {
      full.lastIndex = m.index
      const f = full.exec(this.buf)
      if (!f) {
        keep = m.index
        break
      }
      const t = f[0]
      if (t.startsWith('<Record')) this.record(t.slice(0, t.indexOf('>') + 1))
      else this.workout(t)
      start.lastIndex = full.lastIndex
    }
    // Sin elemento pendiente: guardar solo la cola (podría ser el comienzo de una etiqueta)
    this.buf = keep >= 0 ? this.buf.slice(keep) : this.buf.slice(-16)
  }

  private day(tag: string): Day | null {
    const d = attr(tag, 'startDate')?.slice(0, 10) ?? null
    // Fechas imposibles (hay iPhones viejos con registros de 1939) se descartan
    if (!d || d < '2010-01-01' || d > '2100-01-01') return null
    return !this.since || d >= this.since ? d : null
  }

  private record(tag: string) {
    const kind = QTY[attr(tag, 'type') ?? '']
    if (!kind) return
    const d = this.day(tag)
    const raw = num(attr(tag, 'value'))
    if (!d || !Number.isFinite(raw)) return
    const unit = attr(tag, 'unit') ?? ''
    if (kind === 'weight') {
      const kg = unit === 'lb' ? raw * 0.45359237 : unit === 'g' ? raw / 1000 : raw
      if (kg > 30 && kg < 300) this.weights.set(d, Math.round(kg * 10) / 10)
      return
    }
    if (kind === 'resting_hr') {
      const cur = this.hr.get(d) ?? { s: 0, n: 0 }
      this.hr.set(d, { s: cur.s + raw, n: cur.n + 1 })
      return
    }
    const v = kind === 'active_kcal' && unit === 'kJ' ? raw / 4.184 : raw
    const src = attr(tag, 'sourceName') ?? '?'
    const byDay = this.sums.get(kind) ?? new Map()
    const bySrc = byDay.get(d) ?? new Map()
    bySrc.set(src, (bySrc.get(src) ?? 0) + v)
    byDay.set(d, bySrc)
    this.sums.set(kind, byDay)
  }

  private workout(block: string) {
    const tag = block.slice(0, block.indexOf('>') + 1)
    const d = this.day(tag)
    const start = attr(tag, 'startDate')
    if (!d || !start) return
    const type = (attr(tag, 'workoutActivityType') ?? '').replace('HKWorkoutActivityType', '')
    const dur = num(attr(tag, 'duration'))
    const durUnit = attr(tag, 'durationUnit') ?? 'min'
    let km = num(attr(tag, 'totalDistance'))
    let kmUnit = attr(tag, 'totalDistanceUnit') ?? 'km'
    if (!Number.isFinite(km)) {
      const st = /<WorkoutStatistics\b[^>]*type="HKQuantityTypeIdentifierDistance[^"]*"[^>]*>/.exec(block)?.[0]
      km = st ? num(attr(st, 'sum')) : NaN
      kmUnit = st ? attr(st, 'unit') ?? 'km' : 'km'
    }
    const kcal = num(attr(tag, 'totalEnergyBurned'))
    this.workouts.push({
      day: d,
      start: healthDateToISO(start),
      type,
      minutes: Number.isFinite(dur) ? Math.round(durUnit === 'min' ? dur : durUnit === 's' ? dur / 60 : dur * 60) : null,
      km: Number.isFinite(km) ? Math.round((kmUnit === 'mi' ? km * 1.609344 : kmUnit === 'm' ? km / 1000 : km) * 100) / 100 : null,
      kcal: Number.isFinite(kcal) ? Math.round(kcal) : null,
    })
  }

  /** Resultados finales: por día, el valor de la fuente mayor. */
  result() {
    const metrics: { date: Day; kind: MetricKind; value: number }[] = []
    for (const [kind, byDay] of this.sums)
      for (const [date, bySrc] of byDay) metrics.push({ date, kind, value: Math.round(Math.max(...bySrc.values())) })
    for (const [date, { s, n }] of this.hr) metrics.push({ date, kind: 'resting_hr', value: Math.round(s / n) })
    return { metrics, weights: [...this.weights].map(([date, value]) => ({ date, value })), workouts: this.workouts }
  }
}

const ACT: Record<string, ActivityType> = { Walking: 'caminata', Hiking: 'caminata', Running: 'carrera', Cycling: 'bicicleta' }

/** Lee el zip por partes y devuelve los datos agregados. */
export async function readHealthExport(file: Blob, since: Day | null, onProgress?: (fraction: number) => void) {
  const agg = new HealthAggregator(since)
  let found = false
  const done = new Promise<void>((resolve, reject) => {
    const unzip = new Unzip((entry) => {
      // "export.xml" (inglés) o "exportar.xml"/"exportación.xml" (español); no el CDA
      if (!/(^|\/)export(ar|ación)?\.xml$/i.test(entry.name)) return
      found = true
      const dec = new TextDecoder()
      entry.ondata = (err, chunk, final) => {
        if (err) return reject(err)
        agg.feed(dec.decode(chunk, { stream: !final }))
        if (final) resolve()
      }
      entry.start()
    })
    unzip.register(UnzipInflate)
    ;(async () => {
      const reader = file.stream().getReader()
      let read = 0
      for (;;) {
        const { value, done: end } = await reader.read()
        if (end) break
        read += value.length
        unzip.push(value, false)
        onProgress?.(read / file.size)
        // Ceder el hilo para que la pantalla no se congele
        await new Promise((r) => setTimeout(r, 0))
      }
      unzip.push(new Uint8Array(0), true)
      if (!found) reject(new Error('No encontré export.xml dentro del zip. ¿Es la exportación de Salud?'))
    })().catch(reject)
  })
  await done
  return agg.result()
}

/** Guarda lo agregado sin duplicar (misma fecha + tipo + fuente = mismo registro). */
export async function saveHealthData(data: Awaited<ReturnType<typeof readHealthExport>>): Promise<HealthSummary> {
  const db = getDB()
  const summary: HealthSummary = { days: 0, steps: 0, activeKcal: 0, exerciseMin: 0, restingHr: 0, weights: 0, workouts: 0, from: null, to: null }
  const days = new Set<Day>()
  await db.transaction('rw', db.dailyMetrics, db.measurements, db.activities, db.meta, async () => {
    const existing = new Map((await db.dailyMetrics.where('dedupeKey').startsWith('').toArray()).filter((m) => m.source === 'health' && !m.deletedAt).map((m) => [m.dedupeKey, m]))
    for (const m of data.metrics) {
      const key = dedupeKey(m.date, m.kind, 'health')
      const cur = existing.get(key)
      if (cur) {
        if (cur.value !== m.value) await db.dailyMetrics.update(cur.id, { value: m.value, updatedAt: nowISO(), dirty: 1 })
      } else await insert<DailyMetric>('dailyMetrics', { date: m.date, kind: m.kind, value: m.value, source: 'health', dedupeKey: key })
      days.add(m.date)
      if (m.kind === 'steps') summary.steps++
      else if (m.kind === 'active_kcal') summary.activeKcal++
      else if (m.kind === 'exercise_min') summary.exerciseMin++
      else summary.restingHr++
    }
    const weighed = new Set((await db.measurements.toArray()).filter((x) => x.kind === 'weight' && x.source === 'health' && !x.deletedAt).map((x) => x.date))
    for (const w of data.weights) {
      if (weighed.has(w.date)) continue
      await insert<Measurement>('measurements', { date: w.date, kind: 'weight', value: w.value, note: 'Importado de Salud', source: 'health' })
      summary.weights++
    }
    for (const w of data.workouts) {
      const ext = `health:${w.start.slice(0, 19)}:${w.type}`
      const dup = (await db.activities.where('[source+externalId]').anyOf([['health', ext], ['shortcut', ext]]).toArray()).some((a) => !a.deletedAt)
      if (dup) continue
      await insert<Activity>('activities', {
        id: uuid(), date: w.day, type: ACT[w.type] ?? 'otro', startedAt: w.start, durationMin: w.minutes,
        distanceKm: w.km, avgHr: null, source: 'health', externalId: ext, route: null, notes: w.type,
      })
      summary.workouts++
    }
  })
  const sorted = [...days].sort()
  summary.days = sorted.length
  summary.from = sorted[0] ?? null
  summary.to = sorted.at(-1) ?? null
  return summary
}
