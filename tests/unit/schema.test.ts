import { readdirSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, LovelyDB, setDB, SYNC_TABLES } from '@/lib/db'
import { seedFor } from '@/lib/seed'
import { REMOTE_TABLE, toRow } from '@/lib/sync'
import { insert } from '@/lib/db'
import type { Activity, DailyMetric, Meal, Measurement, Photo, HabitLog, Session, SessionExercise, WorkSet } from '@/lib/types'

// Cada campo que la app sube debe existir como columna en la migración aplicada.
const dir = new URL('../../supabase/migrations/', import.meta.url)
const sql = readdirSync(dir).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
const BASE = ['id', 'owner_id', 'created_at', 'updated_at', 'deleted_at', 'server_updated_at']
function columns(table: string): Set<string> {
  const m = new RegExp(`\\('${table}', \\$c\\$(.*?)\\$c\\$\\)`).exec(sql)
  if (!m) throw new Error(`falta ${table} en la migración`)
  const cols = m[1].split(',').map((c) => c.trim().split(/\s+/)[0].replace(/"/g, '')).filter((c) => /^[a-z_]+$/.test(c))
  const added = [...sql.matchAll(new RegExp(`alter table public\\.${table} add column if not exists (\\w+)`, 'g'))].map((x) => x[1])
  return new Set([...BASE, ...cols, ...added])
}

describe('esquema local ↔ Supabase', () => {
  beforeAll(async () => {
    setDB(new LovelyDB('schema-test'))
    await seedFor()
    const s = await insert<Session>('sessions', { planDayId: null, name: 'x', date: '2026-10-17', startedAt: 'x', endedAt: null, status: 'done', feeling: 3, notes: '' })
    const se = await insert<SessionExercise>('sessionExercises', { sessionId: s.id, exerciseId: 'e', order: 0, status: 'done', substitutedFromId: null, repMin: 8, repMax: 10, restSec: 90, minutes: null, feel: 'justo', note: '' })
    await insert<WorkSet>('sets', { sessionId: s.id, sessionExerciseId: se.id, exerciseId: 'e', order: 0, kind: 'work', weightKg: 70, reps: 10, rir: 2, done: true, doneAt: 'x' })
    await insert<Activity>('activities', { date: '2026-10-17', type: 'caminata', startedAt: null, durationMin: 30, distanceKm: 2, avgHr: null, source: 'manual', externalId: null, route: null, notes: '' })
    await insert<Meal>('meals', { date: '2026-10-17', time: '13:00', slot: 'almuerzo', templateId: null, title: 'x', portion: 'normal', kcalEstimate: null, isFree: false, photoId: null, note: '' })
    await insert<Measurement>('measurements', { date: '2026-10-17', kind: 'weight', value: 105, note: '', source: 'manual' })
    await insert<DailyMetric>('dailyMetrics', { date: '2026-10-17', kind: 'steps', value: 5000, source: 'manual', dedupeKey: 'k' })
    await insert<HabitLog>('habitLogs', { habitId: 'h', date: '2026-10-17', count: 1 })
    await insert<Photo>('photos', { kind: 'meal', date: '2026-10-17', mime: 'image/jpeg', width: 1, height: 1, bytes: 1, storagePath: null, note: '' })
  })
  for (const t of SYNC_TABLES) {
    it(`${t} → ${REMOTE_TABLE[t]}`, async () => {
      const rows = await getDB()[t].toArray()
      expect(rows.length).toBeGreaterThan(0)
      const cols = columns(REMOTE_TABLE[t])
      for (const r of rows) for (const k of Object.keys(toRow(r as never))) expect(cols, `${REMOTE_TABLE[t]}.${k}`).toContain(k)
    })
  }
})
