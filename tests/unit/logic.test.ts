import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, dayKey, isValidDayKey, monthEnd, weekDays, weekStart, weekday } from '@/lib/dates'
import { getDB, insert, setDB, LovelyDB, softDelete, update, getMeta } from '@/lib/db'
import { progressionHint, type Performance } from '@/lib/training'
import { dailyValue, dedupeActivities, kcalForPortion, latest, nextWeighIn, stepStats, suggestWeekdayStepGoal, summarize, weekPeriod, weeksMeetingGoal } from '@/lib/stats'
import { parseShortcutParams, upsertDailyMetric, importGPX } from '@/lib/imports'
import { parseGPX } from '@/lib/gpx'
import { fromRow, resolveIncoming, toRow, toSnake } from '@/lib/sync'
import { seedFor } from '@/lib/seed'
import { exportBackup, importBackup } from '@/lib/backup'
import type { Activity, Base, DailyMetric, Measurement, Session, WorkSet } from '@/lib/types'

let n = 0
beforeEach(async () => {
  setDB(new LovelyDB(`test-${++n}`))
  await getDB().open()
})

const base = (o: Partial<Base> = {}): Base => ({ id: String(Math.random()), ownerId: 'u', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null, dirty: 0, ...o })

describe('fechas', () => {
  it('usa la zona de Buenos Aires, no UTC', () => {
    // 01:30 UTC del 18 = 22:30 del 17 en Buenos Aires (UTC-3)
    expect(dayKey(new Date('2026-10-18T01:30:00Z'))).toBe('2026-10-17')
    expect(dayKey(new Date('2026-10-18T03:30:00Z'))).toBe('2026-10-18')
  })
  it('semana lunes–domingo', () => {
    expect(weekStart('2026-10-17')).toBe('2026-10-12') // sábado → lunes
    expect(weekStart('2026-10-18')).toBe('2026-10-12') // domingo pertenece a la semana anterior
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
    expect(weekDays('2026-10-14')).toHaveLength(7)
    expect(weekday('2026-10-17')).toBe(6)
  })
  it('meses y validación', () => {
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
    expect(monthEnd('2028-02-10')).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(isValidDayKey('2026-02-30')).toBe(false)
    expect(isValidDayKey('2026-02-28')).toBe(true)
  })
})

describe('progresión', () => {
  const perf = (w: number, reps: number[], feel: Performance['feel'] = null): Performance => ({
    session: base() as Session,
    feel,
    sets: reps.map((r, i) => ({ ...base(), weightKg: w, reps: r, order: i, done: true, kind: 'work' }) as WorkSet),
  })
  it('sugiere subir tras dos sesiones completando el rango', () => {
    expect(progressionHint([perf(70, [10, 10, 10]), perf(70, [10, 10, 10])], 10, 2.5)).toMatch(/72,5 kg/)
  })
  it('no sugiere si una serie quedó corta, si fue duro o con una sola sesión', () => {
    expect(progressionHint([perf(70, [10, 10, 9]), perf(70, [10, 10, 10])], 10, 2.5)).toBeNull()
    expect(progressionHint([perf(70, [10, 10, 10], 'duro'), perf(70, [10, 10, 10])], 10, 2.5)).toBeNull()
    expect(progressionHint([perf(70, [10, 10, 10])], 10, 2.5)).toBeNull()
    expect(progressionHint([perf(72.5, [10, 10, 10]), perf(70, [10, 10, 10])], 10, 2.5)).toBeNull()
  })
})

describe('estadísticas', () => {
  const ses = (date: string, status: Session['status'] = 'done') => ({ ...base(), date, status, startedAt: `${date}T10:00:00Z`, endedAt: `${date}T11:00:00Z` }) as Session
  it('cuenta solo sesiones terminadas de la semana', () => {
    const s = summarize(weekPeriod('2026-10-14'), [ses('2026-10-12'), ses('2026-10-13', 'discarded'), ses('2026-10-19'), { ...ses('2026-10-14'), deletedAt: 'x' }], [])
    expect(s.sessions).toBe(1)
    expect(s.strengthMinutes).toBe(60)
  })
  it('semanas con meta no exigen consecutividad', () => {
    const list = ['2026-10-05', '2026-10-06', '2026-10-19', '2026-10-20'].map((d) => ses(d))
    expect(weeksMeetingGoal(list, 2)).toEqual(['2026-10-05', '2026-10-19'])
  })
  it('pasos: varias fuentes del mismo día no se suman; sin datos ≠ 0', () => {
    const m = (date: string, value: number, source: DailyMetric['source']) => ({ ...base(), date, kind: 'steps', value, source, dedupeKey: '' }) as DailyMetric
    const ms = [m('2026-10-12', 5000, 'manual'), m('2026-10-12', 5200, 'shortcut'), m('2026-10-13', 0, 'manual')]
    expect(dailyValue(ms, 'steps', '2026-10-12')).toBe(5200)
    expect(dailyValue(ms, 'steps', '2026-10-13')).toBe(0)
    expect(dailyValue(ms, 'steps', '2026-10-14')).toBeNull()
    const st = stepStats(ms, weekPeriod('2026-10-12'))
    expect(st.daysWithData).toBe(2)
    expect(st.avg).toBe(2600)
  })
  it('meta de pasos solo con ≥5 días hábiles reales, nunca 10.000 por defecto', () => {
    const m = (date: string, value: number) => ({ ...base(), date, kind: 'steps', value, source: 'manual', dedupeKey: '' }) as DailyMetric
    expect(suggestWeekdayStepGoal([m('2026-10-12', 4000)], '2026-10-17')).toBeNull()
    const week = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d, i) => m(d, [4000, 5000, 6000, 4500, 5500][i]))
    expect(suggestWeekdayStepGoal(week, '2026-10-17')).toBe(5500) // mediana 5000 +10 % → 5500
  })
  it('peso: último valor y próximo pesaje', () => {
    const w = (date: string, value: number) => ({ ...base(), date, kind: 'weight', value, note: '', source: 'manual' }) as Measurement
    expect(nextWeighIn([], 14, '2026-10-17')).toEqual({ due: null, overdue: true })
    const ms = [w('2026-10-01', 90.6), w('2026-10-10', 105.2)]
    expect(latest(ms, 'weight')?.value).toBe(105.2)
    expect(nextWeighIn(ms, 14, '2026-10-17')).toEqual({ due: '2026-10-24', overdue: false })
  })
  it('kcal por porción respeta "sin estimación"', () => {
    expect(kcalForPortion(null, 'grande')).toBeNull()
    expect(kcalForPortion(600, 'chica')).toBe(450)
  })
  it('actividades duplicadas por id externo cuentan una vez', () => {
    const a = (id: string, ext: string | null) => ({ ...base({ id }), date: '2026-10-12', source: 'gpx', externalId: ext, durationMin: 30 }) as Activity
    expect(dedupeActivities([a('1', 'x'), a('2', 'x'), a('3', null), a('4', null)])).toHaveLength(3)
  })
})

describe('importación', () => {
  it('Atajos: parsea números con formato regional y valida', () => {
    const ok = parseShortcutParams(new URLSearchParams('date=2026-10-16&steps=8.123&resting_hr=61,5'))
    expect(ok).toEqual({ date: '2026-10-16', metrics: { steps: 8123, resting_hr: 62 } })
    expect('error' in parseShortcutParams(new URLSearchParams('date=2026-13-01&steps=1'))).toBe(true)
    expect('error' in parseShortcutParams(new URLSearchParams('date=2026-10-16'))).toBe(true)
    expect('error' in parseShortcutParams(new URLSearchParams('date=2026-10-16&steps=-5'))).toBe(true)
  })
  it('reimportar el mismo día no duplica', async () => {
    expect(await upsertDailyMetric('2026-10-16', 'steps', 8000, 'shortcut')).toBe('created')
    expect(await upsertDailyMetric('2026-10-16', 'steps', 8000, 'shortcut')).toBe('same')
    expect(await upsertDailyMetric('2026-10-16', 'steps', 9000, 'shortcut')).toBe('updated')
    expect(await upsertDailyMetric('2026-10-16', 'steps', 7000, 'manual')).toBe('created')
    const rows = await getDB().dailyMetrics.toArray()
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.dirty === 1)).toBe(true)
  })
  it('GPX: coordenadas reales, distancia y sin duplicar', async () => {
    const gpx = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="-34.6037" lon="-58.3816"><time>2026-10-16T10:00:00Z</time></trkpt>
      <trkpt lat="-34.6047" lon="-58.3816"><time>2026-10-16T10:05:00Z</time></trkpt>
      <trkpt lat="-34.6057" lon="-58.3816"><time>2026-10-16T10:10:00Z</time></trkpt>
    </trkseg></trk></gpx>`
    const t = parseGPX(gpx)
    expect(t.points).toHaveLength(3)
    expect(t.distanceKm).toBeCloseTo(0.22, 1)
    expect(t.durationMin).toBe(10)
    expect((await importGPX(gpx, 'caminata')).status).toBe('created')
    expect((await importGPX(gpx, 'caminata')).status).toBe('duplicate')
    expect(() => parseGPX('<gpx></gpx>')).toThrow()
  })
})

describe('almacenamiento local', () => {
  it('insert/update/softDelete marcan pendiente de subir', async () => {
    const m = await insert<Measurement>('measurements', { date: '2026-10-17', kind: 'weight', value: 105, note: '', source: 'manual' })
    await getDB().measurements.update(m.id, { dirty: 0 })
    await update<Measurement>('measurements', m.id, { value: 104.8 })
    let row = await getDB().measurements.get(m.id)
    expect(row?.dirty).toBe(1)
    expect(row?.value).toBe(104.8)
    await softDelete('measurements', m.id)
    row = await getDB().measurements.get(m.id)
    expect(row?.deletedAt).not.toBeNull()
    await expect(update('measurements', 'no-existe', {})).rejects.toThrow()
  })
  it('seed crea perfil y plan A–D con datos declarados', async () => {
    await seedFor({ displayName: 'Test', heightCm: 180, declaredWeightKg: 90 })
    const p = (await getDB().profiles.toArray())[0]
    expect(p.heightCm).toBe(180)
    expect(p.healthNotes).toBe('')
    expect(p.weeklySessionGoal).toBe(4)
    expect(p.weekdayStepGoal).toBeNull()
    expect(await getDB().measurements.count()).toBe(0) // el peso declarado no es una medición
    const days = await getDB().planDays.toArray()
    expect(days.map((d) => d.name).sort()).toEqual(['A · Torso', 'B · Mixto', 'C · Torso', 'D · Mixto'])
    expect((await getDB().reminders.toArray()).every((r) => !r.enabled)).toBe(true)
    expect(await getMeta('seeded')).toBe(true)
  })
  it('respaldo: exportar e importar no duplica y gana lo más nuevo', async () => {
    await seedFor()
    const text = await (await exportBackup(false)).text()
    const again = await importBackup(text)
    expect(again.inserted).toBe(0)
    expect(again.updated).toBe(0)
    const data = JSON.parse(text)
    data.tables.profiles[0].displayName = 'Otro'
    data.tables.profiles[0].updatedAt = '2999-01-01T00:00:00Z'
    const r = await importBackup(JSON.stringify(data))
    expect(r.updated).toBe(1)
    expect((await getDB().profiles.toArray())[0].displayName).toBe('Otro')
    await expect(importBackup('{"app":"otra"}')).rejects.toThrow()
  })
})

describe('sincronización (lógica pura)', () => {
  it('mapea camelCase ↔ snake_case y nunca envía campos locales', () => {
    const row = toRow({ id: '1', ownerId: 'u', weightKg: 70, dirty: 1, sessionExerciseId: 's' })
    expect(row).toEqual({ id: '1', owner_id: 'u', weight_kg: 70, session_exercise_id: 's' })
    expect(fromRow({ id: '1', owner_id: 'u', server_updated_at: 'x', weight_kg: 70 })).toEqual({ id: '1', ownerId: 'u', weightKg: 70, dirty: 0 })
    expect(toSnake('group')).toBe('group')
  })
  it('last-write-wins sin perder cambios locales pendientes', () => {
    const remote = base({ updatedAt: '2026-10-17T10:00:00Z' })
    expect(resolveIncoming(undefined, remote)).toBe('take')
    expect(resolveIncoming(base({ dirty: 0, updatedAt: '2026-10-17T12:00:00Z' }), remote)).toBe('take')
    expect(resolveIncoming(base({ dirty: 1, updatedAt: '2026-10-17T12:00:00Z' }), remote)).toBe('keep')
    expect(resolveIncoming(base({ dirty: 1, updatedAt: '2026-10-17T09:00:00Z' }), remote)).toBe('take')
  })
})
