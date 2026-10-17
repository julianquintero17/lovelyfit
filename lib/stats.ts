import { addDays, daysBetween, monthEnd, monthStart, weekStart, weekday, type DayKey } from './dates'
import { sessionMinutes } from './training'
import type { Activity, DailyMetric, Measurement, Session } from './types'

export interface Period {
  from: DayKey
  to: DayKey
}

export const weekPeriod = (k: DayKey): Period => ({ from: weekStart(k), to: addDays(weekStart(k), 6) })
export const monthPeriod = (k: DayKey): Period => ({ from: monthStart(k), to: monthEnd(k) })

const inP = (d: DayKey, p: Period) => d >= p.from && d <= p.to

export function doneSessions(sessions: Session[]): Session[] {
  return sessions.filter((s) => !s.deletedAt && s.status === 'done')
}

export interface PeriodSummary {
  sessions: number
  strengthMinutes: number
  cardioMinutes: number
  cardioKm: number | null
  activities: number
}

export function summarize(p: Period, sessions: Session[], activities: Activity[]): PeriodSummary {
  const ss = doneSessions(sessions).filter((s) => inP(s.date, p))
  const acts = dedupeActivities(activities).filter((a) => inP(a.date, p))
  const kms = acts.map((a) => a.distanceKm).filter((x): x is number => x != null)
  return {
    sessions: ss.length,
    strengthMinutes: ss.reduce((acc, s) => acc + (sessionMinutes(s) ?? 0), 0),
    cardioMinutes: acts.reduce((acc, a) => acc + (a.durationMin ?? 0), 0),
    cardioKm: kms.length ? Math.round(kms.reduce((a, b) => a + b, 0) * 10) / 10 : null,
    activities: acts.length,
  }
}

/** Misma actividad importada dos veces (misma fuente + id externo) cuenta una sola vez. */
export function dedupeActivities(activities: Activity[]): Activity[] {
  const seen = new Set<string>()
  const out: Activity[] = []
  for (const a of [...activities].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    if (a.deletedAt) continue
    if (a.externalId) {
      const k = `${a.source}|${a.externalId}`
      if (seen.has(k)) continue
      seen.add(k)
    }
    out.push(a)
  }
  return out
}

/** Semanas (lunes) en que se alcanzó la meta. No hay rachas que se "rompan". */
export function weeksMeetingGoal(sessions: Session[], goal: number): DayKey[] {
  const count = new Map<DayKey, number>()
  for (const s of doneSessions(sessions)) {
    const w = weekStart(s.date)
    count.set(w, (count.get(w) ?? 0) + 1)
  }
  return [...count.entries()].filter(([, n]) => n >= goal).map(([w]) => w).sort()
}

export interface Achievement {
  id: string
  title: string
  detail: string
  earned: boolean
}

export function achievements(input: {
  sessions: Session[]
  activities: Activity[]
  measurements: Measurement[]
  goal: number
}): Achievement[] {
  const done = doneSessions(input.sessions).length
  const weeks = weeksMeetingGoal(input.sessions, input.goal).length
  const weights = input.measurements.filter((m) => !m.deletedAt && m.kind === 'weight').length
  const acts = input.activities.filter((a) => !a.deletedAt).length
  return [
    { id: 'first', title: 'Primera sesión', detail: 'Arrancaste.', earned: done >= 1 },
    { id: 's10', title: '10 sesiones', detail: `${Math.min(done, 10)}/10`, earned: done >= 10 },
    { id: 's25', title: '25 sesiones', detail: `${Math.min(done, 25)}/25`, earned: done >= 25 },
    { id: 'w1', title: 'Semana cumplida', detail: `Meta de ${input.goal} sesiones en una semana`, earned: weeks >= 1 },
    { id: 'w4', title: '4 semanas cumplidas', detail: `${Math.min(weeks, 4)}/4 · no hace falta que sean seguidas`, earned: weeks >= 4 },
    { id: 'weigh', title: 'Primer pesaje', detail: 'Punto de partida con fecha', earned: weights >= 1 },
    { id: 'move', title: 'Primera salida', detail: 'Caminata, bici o carrera registrada', earned: acts >= 1 },
  ]
}

export function latest(ms: Measurement[], kind: Measurement['kind']): Measurement | undefined {
  return ms
    .filter((m) => !m.deletedAt && m.kind === kind)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0]
}

export function series(ms: Measurement[], kind: Measurement['kind']): { date: DayKey; value: number }[] {
  // Un valor por día (el último cargado) para no duplicar puntos.
  const byDay = new Map<DayKey, Measurement>()
  for (const m of ms.filter((m) => !m.deletedAt && m.kind === kind)) {
    const cur = byDay.get(m.date)
    if (!cur || m.updatedAt > cur.updatedAt) byDay.set(m.date, m)
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ date: m.date, value: m.value }))
}

export function nextWeighIn(ms: Measurement[], everyDays: number, today: DayKey): { due: DayKey | null; overdue: boolean } {
  const last = latest(ms, 'weight')
  if (!last) return { due: null, overdue: true }
  const due = addDays(last.date, everyDays)
  return { due, overdue: daysBetween(due, today) >= 0 }
}

// ---- Pasos ---------------------------------------------------------------

/**
 * Valor de un día cuando hay varias fuentes: se toma el máximo (las fuentes
 * miden lo mismo y sumarlas duplicaría pasos).
 */
export function dailyValue(metrics: DailyMetric[], kind: DailyMetric['kind'], date: DayKey): number | null {
  const vals = metrics.filter((m) => !m.deletedAt && m.kind === kind && m.date === date).map((m) => m.value)
  return vals.length ? Math.max(...vals) : null
}

export interface StepStats {
  daysWithData: number
  weekdayDaysWithData: number
  avg: number | null
  weekdayMedian: number | null
  lastDate: DayKey | null
}

export function stepStats(metrics: DailyMetric[], p: Period): StepStats {
  const days: { date: DayKey; v: number }[] = []
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
    const v = dailyValue(metrics, 'steps', d)
    if (v != null) days.push({ date: d, v })
  }
  const wk = days.filter((d) => weekday(d.date) >= 1 && weekday(d.date) <= 5).map((d) => d.v).sort((a, b) => a - b)
  const all = metrics.filter((m) => !m.deletedAt && m.kind === 'steps').map((m) => m.date).sort()
  return {
    daysWithData: days.length,
    weekdayDaysWithData: wk.length,
    avg: days.length ? Math.round(days.reduce((a, b) => a + b.v, 0) / days.length) : null,
    weekdayMedian: wk.length ? (wk.length % 2 ? wk[(wk.length - 1) / 2] : Math.round((wk[wk.length / 2 - 1] + wk[wk.length / 2]) / 2)) : null,
    lastDate: all.length ? all[all.length - 1] : null,
  }
}

/**
 * Sugerencia de meta entre semana: solo con ≥5 días hábiles con datos reales.
 * Mediana + ~10 %, redondeada a 500. Nunca 10.000 por defecto.
 */
export function suggestWeekdayStepGoal(metrics: DailyMetric[], today: DayKey): number | null {
  const from = addDays(today, -13)
  const st = stepStats(metrics, { from, to: today })
  if (st.weekdayDaysWithData < 5 || st.weekdayMedian == null) return null
  return Math.max(500, Math.round((st.weekdayMedian * 1.1) / 500) * 500)
}

export function kcalForPortion(kcalNormal: number | null, portion: 'chica' | 'normal' | 'grande'): number | null {
  if (kcalNormal == null) return null
  const f = portion === 'chica' ? 0.75 : portion === 'grande' ? 1.3 : 1
  return Math.round(kcalNormal * f)
}
