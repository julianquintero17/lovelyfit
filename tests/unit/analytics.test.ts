import { describe, expect, it } from 'vitest'
import { e1rm, insights, personalRecords, setsByGroup, stepsTrainingVsRest, weeklyConsistency, weightTrend } from '@/lib/analytics'
import { weekPeriod } from '@/lib/stats'
import type { Base, DailyMetric, Exercise, Measurement, Session, WorkSet } from '@/lib/types'

let i = 0
const b = (o: Partial<Base> = {}): Base => ({ id: `id${++i}`, ownerId: 'u', createdAt: 'x', updatedAt: 'x', deletedAt: null, dirty: 0, ...o })
const ses = (date: string, status: Session['status'] = 'done') => ({ ...b(), date, status, startedAt: `${date}T10:00:00Z`, endedAt: `${date}T11:00:00Z`, name: 's', planDayId: null, feeling: null, notes: '' }) as Session
const ex = (id: string, name: string, group: Exercise['group']) => ({ ...b({ id }), name, group, equipment: '', instructions: '', incrementKg: 2.5, photoId: null, isCustom: false }) as Exercise
const set = (s: Session, exerciseId: string, w: number | null, r: number | null, extra: Partial<WorkSet> = {}) =>
  ({ ...b(), sessionId: s.id, sessionExerciseId: 'se', exerciseId, order: 0, kind: 'work', weightKg: w, reps: r, rir: null, done: true, doneAt: null, ...extra }) as WorkSet

describe('análisis', () => {
  it('1RM estimado solo con rangos razonables', () => {
    expect(e1rm(100, 10)).toBeCloseTo(133.3, 1)
    expect(e1rm(100, 1)).toBe(100) // una serie de 1 es la marca real
    expect(e1rm(100, 20)).toBeNull()
    expect(e1rm(null, 8)).toBeNull()
  })
  it('récords: la primera vez no es récord; mejorar sí', () => {
    const s1 = ses('2026-10-05'), s2 = ses('2026-10-13'), s3 = ses('2026-10-14', 'discarded')
    const exercises = [ex('bench', 'Press banca', 'pecho')]
    const sets = [set(s1, 'bench', 70, 10), set(s2, 'bench', 75, 10), set(s3, 'bench', 200, 5), set(s2, 'bench', 80, 2, { kind: 'warmup' })]
    const r = personalRecords({ sessions: [s1, s2, s3], sets, exercises }, weekPeriod('2026-10-13'))
    expect(r.best[0].weightKg).toBe(75) // la descartada y la aproximación no cuentan
    expect(r.inPeriod).toHaveLength(1)
    expect(r.inPeriod[0].improvement).toBeCloseTo(6.7, 1)
    // Semana pasada: su récord se ve aunque después haya otro mayor
    const s4 = ses('2026-10-20')
    const later = personalRecords({ sessions: [s1, s2, s4], sets: [...sets, set(s4, 'bench', 90, 10)], exercises }, weekPeriod('2026-10-13'))
    expect(later.inPeriod).toHaveLength(1)
    expect(later.inPeriod[0].weightKg).toBe(75)
    const first = personalRecords({ sessions: [s1], sets: [sets[0]], exercises }, weekPeriod('2026-10-05'))
    expect(first.inPeriod).toHaveLength(0)
  })
  it('series por grupo excluyen cardio, no hechas y otros períodos', () => {
    const s = ses('2026-10-13'), old = ses('2026-10-01')
    const exercises = [ex('a', 'A', 'pecho'), ex('b', 'B', 'espalda'), ex('c', 'C', 'cardio')]
    const sets = [set(s, 'a', 50, 10), set(s, 'a', 50, 10), set(s, 'b', 40, 10), set(s, 'b', 40, 10, { done: false }), set(s, 'c', null, null), set(old, 'a', 50, 10)]
    expect(setsByGroup({ sessions: [s, old], sets, exercises }, weekPeriod('2026-10-13'))).toEqual([{ group: 'pecho', sets: 2 }, { group: 'espalda', sets: 1 }])
  })
  it('constancia de 8 semanas incluye semanas vacías', () => {
    const c = weeklyConsistency([ses('2026-10-13'), ses('2026-10-14'), ses('2026-09-01')], '2026-10-17')
    expect(c).toHaveLength(8)
    expect(c.at(-1)).toEqual({ week: '2026-10-12', count: 2 })
    expect(c.filter((w) => w.count === 0).length).toBe(6)
  })
  it('tendencia de peso necesita al menos una semana', () => {
    const m = (date: string, value: number) => ({ ...b(), date, kind: 'weight', value, note: '', source: 'manual' }) as Measurement
    expect(weightTrend([m('2026-10-01', 106)])).toBeNull()
    expect(weightTrend([m('2026-10-01', 106), m('2026-10-03', 105)])).toBeNull()
    expect(weightTrend([m('2026-10-01', 106), m('2026-10-15', 105)])?.kgPerWeek).toBe(-0.5)
  })
  it('pasos en días de entrenamiento vs descanso e insights sin culpa', () => {
    const d = (date: string, value: number) => ({ ...b(), date, kind: 'steps', value, source: 'manual', dedupeKey: '' }) as DailyMetric
    const st = stepsTrainingVsRest([ses('2026-10-12'), ses('2026-10-14')], [d('2026-10-12', 9000), d('2026-10-14', 11000), d('2026-10-13', 4000), d('2026-10-15', 6000)], weekPeriod('2026-10-12'))
    expect(st).toEqual({ training: 10000, rest: 5000, trainingDays: 2, restDays: 2 })
    const text = insights({ consistency: weeklyConsistency([ses('2026-10-06')], '2026-10-17'), goal: 4, prs: [], trend: null, steps: st }).join(' ')
    expect(text).toMatch(/La semana pasada entrenaste/)
    expect(text).not.toMatch(/últimas 7 semanas/) // semanas antes de empezar no cuentan
    expect(text).not.toMatch(/fallaste|deberías|mal/i)
  })
})
