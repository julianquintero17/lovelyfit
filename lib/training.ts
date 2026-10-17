import { getDB, insert, nowISO, update } from './db'
import { dayKey } from './dates'
import type { Exercise, PlanDay, Session, SessionExercise, WorkSet } from './types'

export async function activeSession(): Promise<Session | undefined> {
  const list = await getDB().sessions.where('status').equals('in_progress').toArray()
  return list.filter((s) => !s.deletedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

/** Crea la sesión con ejercicios y series precargadas (kg de la última vez). */
export async function startSession(day: PlanDay | null, tz?: string): Promise<Session> {
  const db = getDB()
  return db.transaction('rw', db.tables, async () => {
    const session = await insert<Session>('sessions', {
      planDayId: day?.id ?? null,
      name: day?.name ?? 'Sesión libre',
      date: dayKey(new Date(), tz),
      startedAt: nowISO(),
      endedAt: null,
      status: 'in_progress',
      feeling: null,
      notes: '',
    })
    let order = 0
    for (const it of day?.items ?? []) {
      await addExerciseToSession(session.id, it.exerciseId, {
        order: order++, sets: it.sets, repMin: it.repMin, repMax: it.repMax, restSec: it.restSec, minutes: it.minutes,
      })
    }
    return session
  })
}

export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
  opts: { order: number; sets: number; repMin: number; repMax: number; restSec: number; minutes: number | null; substitutedFromId?: string | null },
): Promise<SessionExercise> {
  const se = await insert<SessionExercise>('sessionExercises', {
    sessionId, exerciseId, order: opts.order, status: 'pending', substitutedFromId: opts.substitutedFromId ?? null,
    repMin: opts.repMin, repMax: opts.repMax, restSec: opts.restSec, minutes: opts.minutes, feel: null, note: '',
  })
  if (opts.minutes == null) {
    const prev = await lastPerformance(exerciseId, sessionId)
    for (let i = 0; i < opts.sets; i++) {
      const p = prev?.sets[i] ?? prev?.sets[prev.sets.length - 1]
      await insert<WorkSet>('sets', {
        sessionId, sessionExerciseId: se.id, exerciseId, order: i, kind: 'work',
        weightKg: p?.weightKg ?? null, reps: null, rir: null, done: false, doneAt: null,
      })
    }
  }
  return se
}

export interface Performance {
  session: Session
  sets: WorkSet[]
  feel: SessionExercise['feel']
}

/** Últimas N sesiones terminadas donde se hizo el ejercicio (series de trabajo completadas). */
export async function recentPerformances(exerciseId: string, excludeSessionId?: string, limit = 3): Promise<Performance[]> {
  const db = getDB()
  const sets = (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter(
    (s) => !s.deletedAt && s.done && s.kind === 'work' && s.sessionId !== excludeSessionId,
  )
  const bySession = new Map<string, WorkSet[]>()
  for (const s of sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s])
  const sessions = (await db.sessions.bulkGet([...bySession.keys()])).filter(
    (s): s is Session => !!s && !s.deletedAt && s.status !== 'discarded',
  )
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const out: Performance[] = []
  for (const s of sessions.slice(0, limit)) {
    const ses = (await db.sessionExercises.where('sessionId').equals(s.id).toArray()).find(
      (x) => x.exerciseId === exerciseId && !x.deletedAt,
    )
    out.push({ session: s, sets: bySession.get(s.id)!.sort((a, b) => a.order - b.order), feel: ses?.feel ?? null })
  }
  return out
}

export async function lastPerformance(exerciseId: string, excludeSessionId?: string) {
  return (await recentPerformances(exerciseId, excludeSessionId, 1))[0]
}

/**
 * Regla propuesta: si en las dos últimas sesiones TODAS las series de trabajo
 * llegaron al tope del rango con la misma carga y no se marcó como "duro",
 * sugerir sumar el incremento mínimo. Es una sugerencia, no una orden.
 */
export function progressionHint(perfs: Performance[], repMax: number, incrementKg: number): string | null {
  if (incrementKg <= 0 || repMax <= 0 || perfs.length < 2) return null
  const [a, b] = perfs
  const topAll = (p: Performance) =>
    p.sets.length > 0 && p.sets.every((s) => (s.reps ?? 0) >= repMax && s.weightKg != null) && p.feel !== 'duro'
  if (!topAll(a) || !topAll(b)) return null
  const wa = Math.max(...a.sets.map((s) => s.weightKg ?? 0))
  const wb = Math.max(...b.sets.map((s) => s.weightKg ?? 0))
  if (wa !== wb) return null
  return `Completaste el rango dos veces con ${fmtKg(wa)} kg. Si la técnica acompaña, probá ${fmtKg(wa + incrementKg)} kg.`
}

export function fmtKg(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

export function describeSets(sets: WorkSet[]): string {
  if (!sets.length) return 'sin series'
  const w = sets.map((s) => s.weightKg)
  const same = w.every((x) => x === w[0])
  if (same) return `${fmtKg(w[0])} kg × ${sets.map((s) => s.reps ?? '—').join(', ')}`
  return sets.map((s) => `${fmtKg(s.weightKg)}×${s.reps ?? '—'}`).join(' · ')
}

export async function finishSession(id: string, feeling: number | null, notes: string) {
  await update<Session>('sessions', id, { status: 'done', endedAt: nowISO(), feeling, notes })
}

export async function discardSession(id: string) {
  await update<Session>('sessions', id, { status: 'discarded', endedAt: nowISO() })
}

/** Volumen (kg × reps) de series de trabajo completadas. */
export function volume(sets: WorkSet[]): number {
  return sets.reduce((acc, s) => acc + (s.done && s.kind === 'work' ? (s.weightKg ?? 0) * (s.reps ?? 0) : 0), 0)
}

export function sessionMinutes(s: Session): number | null {
  if (!s.endedAt) return null
  const m = Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000)
  // Una sesión olvidada abierta no debería contar 9 horas
  return m > 0 ? Math.min(m, 180) : null
}

export function exerciseById(list: Exercise[] | undefined) {
  const m = new Map<string, Exercise>()
  for (const e of list ?? []) m.set(e.id, e)
  return m
}
