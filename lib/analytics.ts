import { addDays, daysBetween, weekStart, type DayKey } from './dates'
import { dailyValue, doneSessions, series, type Period } from './stats'
import type { DailyMetric, Exercise, Measurement, MuscleGroup, Session, WorkSet } from './types'

/** 1RM estimado (Epley). Solo con 1–12 repes; más allá la estimación no es confiable. */
export function e1rm(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || !reps || reps < 1 || reps > 12) return null
  if (reps === 1) return weightKg // una serie de 1 ya es la marca real
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}

interface Ctx {
  sessions: Session[]
  sets: WorkSet[]
  exercises: Exercise[]
}

const validSets = ({ sessions, sets }: Pick<Ctx, 'sessions' | 'sets'>) => {
  const done = new Map(doneSessions(sessions).map((s) => [s.id, s]))
  return sets
    .filter((x) => !x.deletedAt && x.done && x.kind === 'work' && done.has(x.sessionId))
    .map((x) => ({ set: x, session: done.get(x.sessionId)! }))
}

export interface PR {
  exerciseId: string
  name: string
  date: DayKey
  weightKg: number
  reps: number
  e1rm: number
  /** Mejora sobre la mejor marca anterior (kg de 1RM estimado); null si es la primera. */
  improvement: number | null
}

/** Récords: la mejor serie (por 1RM estimado) de cada ejercicio, y cuáles se lograron en el período. */
export function personalRecords(ctx: Ctx, period?: Period): { best: PR[]; inPeriod: PR[] } {
  const names = new Map(ctx.exercises.map((e) => [e.id, e.name]))
  const rows = validSets(ctx)
    .map(({ set, session }) => ({ set, date: session.date, est: e1rm(set.weightKg, set.reps) }))
    .filter((r): r is { set: WorkSet; date: DayKey; est: number } => r.est != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const best = new Map<string, PR>()
  const before = new Map<string, number>() // mejor marca antes del período
  for (const r of rows) {
    const cur = best.get(r.set.exerciseId)
    if (period && r.date < period.from) before.set(r.set.exerciseId, Math.max(before.get(r.set.exerciseId) ?? 0, r.est))
    if (!cur || r.est > cur.e1rm) {
      best.set(r.set.exerciseId, {
        exerciseId: r.set.exerciseId, name: names.get(r.set.exerciseId) ?? 'Ejercicio', date: r.date,
        weightKg: r.set.weightKg!, reps: r.set.reps!, e1rm: r.est, improvement: cur ? Math.round((r.est - cur.e1rm) * 10) / 10 : null,
      })
    }
  }
  // Récord del período: la mejor marca DENTRO del período supera la mejor previa (la primera vez no cuenta).
  // Funciona también para semanas pasadas, aunque después haya habido marcas mayores.
  const inPeriod: PR[] = []
  if (period) {
    const top = new Map<string, (typeof rows)[number]>()
    for (const r of rows) {
      if (r.date < period.from || r.date > period.to) continue
      const cur = top.get(r.set.exerciseId)
      if (!cur || r.est > cur.est) top.set(r.set.exerciseId, r)
    }
    for (const [id, r] of top) {
      const base = before.get(id)
      if (base != null && r.est > base) {
        inPeriod.push({ exerciseId: id, name: names.get(id) ?? 'Ejercicio', date: r.date, weightKg: r.set.weightKg!, reps: r.set.reps!, e1rm: r.est, improvement: Math.round((r.est - base) * 10) / 10 })
      }
    }
  }
  return { best: [...best.values()].sort((a, b) => b.e1rm - a.e1rm), inPeriod }
}

/** Series efectivas (de trabajo, completadas) por grupo muscular en el período. */
export function setsByGroup(ctx: Ctx, period: Period): { group: MuscleGroup; sets: number }[] {
  const groups = new Map(ctx.exercises.map((e) => [e.id, e.group]))
  const count = new Map<MuscleGroup, number>()
  for (const { set, session } of validSets(ctx)) {
    if (session.date < period.from || session.date > period.to) continue
    const g = groups.get(set.exerciseId) ?? 'otro'
    if (g === 'cardio') continue
    count.set(g, (count.get(g) ?? 0) + 1)
  }
  return [...count.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets)
}

/** Sesiones por semana de las últimas N semanas (incluida la actual). */
export function weeklyConsistency(sessions: Session[], today: DayKey, weeks = 8): { week: DayKey; count: number }[] {
  const current = weekStart(today)
  const counts = new Map<DayKey, number>()
  for (const s of doneSessions(sessions)) counts.set(weekStart(s.date), (counts.get(weekStart(s.date)) ?? 0) + 1)
  return Array.from({ length: weeks }, (_, i) => {
    const w = addDays(current, -7 * (weeks - 1 - i))
    return { week: w, count: counts.get(w) ?? 0 }
  })
}

/** Tendencia de peso en kg por semana (regresión lineal). Necesita ≥2 pesajes separados ≥7 días. */
export function weightTrend(measurements: Measurement[], windowDays = 56): { kgPerWeek: number; points: number; spanDays: number } | null {
  const all = series(measurements, 'weight')
  if (!all.length) return null
  // Solo lo reciente (8 semanas por defecto): un promedio de toda la historia confunde
  const last = all[all.length - 1].date
  const pts = all.filter((p) => daysBetween(p.date, last) <= windowDays)
  if (pts.length < 2) return null
  const span = daysBetween(pts[0].date, pts[pts.length - 1].date)
  if (span < 7) return null
  const xs = pts.map((p) => daysBetween(pts[0].date, p.date))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = pts.reduce((a, p) => a + p.value, 0) / pts.length
  const num = xs.reduce((a, x, i) => a + (x - mx) * (pts[i].value - my), 0)
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  if (!den) return null
  return { kgPerWeek: Math.round((num / den) * 7 * 100) / 100, points: pts.length, spanDays: span }
}

/** Promedio de pasos en días con entrenamiento vs. días sin, dentro del período (solo días con dato). */
export function stepsTrainingVsRest(sessions: Session[], metrics: DailyMetric[], period: Period, today?: DayKey) {
  const trained = new Set(doneSessions(sessions).map((s) => s.date))
  const a: number[] = []
  const b: number[] = []
  // El día en curso tiene pasos parciales: no se compara
  const to = today && period.to >= today ? addDays(today, -1) : period.to
  for (let d = period.from; d <= to; d = addDays(d, 1)) {
    const v = dailyValue(metrics, 'steps', d)
    if (v == null) continue
    ;(trained.has(d) ? a : b).push(v)
  }
  const avg = (x: number[]) => (x.length ? Math.round(x.reduce((s, v) => s + v, 0) / x.length) : null)
  return { training: avg(a), rest: avg(b), trainingDays: a.length, restDays: b.length }
}

/** Frases cortas, sin culpa, basadas solo en datos existentes. */
export function insights(input: {
  consistency: { week: DayKey; count: number }[]
  goal: number
  prs: PR[]
  trend: ReturnType<typeof weightTrend>
  steps: ReturnType<typeof stepsTrainingVsRest>
}): string[] {
  const out: string[] = []
  // Semanas cerradas desde la primera con entrenamiento (antes de empezar a usar la app no cuentan)
  const closed = input.consistency.slice(0, -1)
  const first = closed.findIndex((w) => w.count > 0)
  const past = first >= 0 ? closed.slice(first) : []
  const met = past.filter((w) => w.count >= input.goal).length
  const active = past.filter((w) => w.count > 0).length
  if (active > 0) {
    out.push(past.length === 1
      ? `La semana pasada entrenaste${met ? ' y cumpliste la meta' : ''}.`
      : `En las últimas ${past.length} semanas entrenaste en ${active}${met ? ` y cumpliste la meta en ${met}` : ''}.`)
  }
  if (input.prs.length) {
    const top = [...input.prs].sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0))[0]
    out.push(`${input.prs.length} récord${input.prs.length > 1 ? 's' : ''} en este período. El mayor salto: ${top.name} (+${String(top.improvement ?? 0).replace('.', ',')} kg de 1RM estimado).`)
  }
  if (input.trend) {
    const k = input.trend.kgPerWeek
    const txt = Math.abs(k) < 0.1 ? 'estable' : k < 0 ? `bajando ~${String(Math.abs(k)).replace('.', ',')} kg por semana` : `subiendo ~${String(k).replace('.', ',')} kg por semana`
    out.push(`Peso ${txt} (${input.trend.points} pesajes en ${input.trend.spanDays} días).`)
  }
  const st = input.steps
  if (st.training != null && st.rest != null && st.trainingDays >= 2 && st.restDays >= 2) {
    out.push(`Los días que entrenás caminás ~${st.training.toLocaleString('es-AR')} pasos; los otros, ~${st.rest.toLocaleString('es-AR')}.`)
  }
  return out
}
