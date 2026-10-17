import Dexie, { type Table } from 'dexie'
import type {
  Activity, Base, DailyMetric, Exercise, Habit, HabitLog, Meal, MealTemplate, Measurement, MetaRow,
  Photo, PhotoBlob, Plan, PlanDay, Profile, Reminder, Session, SessionExercise, SyncTable, WorkSet,
} from './types'

export class LovelyDB extends Dexie {
  profiles!: Table<Profile, string>
  exercises!: Table<Exercise, string>
  plans!: Table<Plan, string>
  planDays!: Table<PlanDay, string>
  sessions!: Table<Session, string>
  sessionExercises!: Table<SessionExercise, string>
  sets!: Table<WorkSet, string>
  activities!: Table<Activity, string>
  mealTemplates!: Table<MealTemplate, string>
  meals!: Table<Meal, string>
  measurements!: Table<Measurement, string>
  dailyMetrics!: Table<DailyMetric, string>
  habits!: Table<Habit, string>
  habitLogs!: Table<HabitLog, string>
  photos!: Table<Photo, string>
  photoBlobs!: Table<PhotoBlob, string>
  reminders!: Table<Reminder, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'lovely-fit') {
    super(name)
    const common = 'id, ownerId, dirty, updatedAt'
    this.version(1).stores({
      profiles: common,
      exercises: `${common}, name`,
      plans: common,
      planDays: `${common}, planId`,
      sessions: `${common}, date, status, planDayId`,
      sessionExercises: `${common}, sessionId, exerciseId`,
      sets: `${common}, sessionId, sessionExerciseId, exerciseId`,
      activities: `${common}, date, [source+externalId]`,
      mealTemplates: common,
      meals: `${common}, date`,
      measurements: `${common}, date, kind`,
      dailyMetrics: `${common}, date, kind, dedupeKey`,
      habits: common,
      habitLogs: `${common}, [habitId+date], date`,
      photos: `${common}, kind, date`,
      photoBlobs: 'id',
      reminders: common,
      meta: 'key',
    })
  }
}

export const SYNC_TABLES: SyncTable[] = [
  'profiles', 'exercises', 'plans', 'planDays', 'sessions', 'sessionExercises', 'sets', 'activities',
  'mealTemplates', 'meals', 'measurements', 'dailyMetrics', 'habits', 'habitLogs', 'photos', 'reminders',
]

let _db: LovelyDB | null = null
export function getDB(): LovelyDB {
  if (!_db) _db = new LovelyDB()
  return _db
}
/** Solo para tests. */
export function setDB(db: LovelyDB) {
  _db = db
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Respaldo para navegadores viejos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const nowISO = () => new Date().toISOString()

// ---- Propietario actual -------------------------------------------------------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await getDB().meta.get(key))?.value as T | undefined
}
export async function setMeta(key: string, value: unknown) {
  await getDB().meta.put({ key, value })
}

/**
 * Id del propietario. Sin cuenta: un id local estable ("local-…").
 * Al iniciar sesión, los registros locales se reasignan al usuario de Supabase.
 */
export async function currentOwnerId(): Promise<string> {
  const id = await getMeta<string>('ownerId')
  if (id) return id
  const local = `local-${uuid()}`
  await setMeta('ownerId', local)
  return local
}

// ---- Escrituras -------------------------------------------------------------
// Todas las escrituras pasan por acá: estampan dueño/fechas y marcan dirty=1
// para que la cola de sincronización las suba. Si IndexedDB falla, la promesa
// se rechaza y la UI muestra error (nunca "guardado").

type NewOf<T extends Base> = Omit<T, keyof Base> & Partial<Pick<Base, 'id'>>

export async function insert<T extends Base>(table: SyncTable, data: NewOf<T>): Promise<T> {
  const ownerId = await currentOwnerId()
  const now = nowISO()
  const row = { ...data, id: data.id ?? uuid(), ownerId, createdAt: now, updatedAt: now, deletedAt: null, dirty: 1 } as unknown as T
  await (getDB()[table] as unknown as Table<T, string>).add(row)
  notifyChange()
  return row
}

export async function update<T extends Base>(table: SyncTable, id: string, patch: Partial<Omit<T, keyof Base>>): Promise<void> {
  const t = getDB()[table] as unknown as Table<T, string>
  const n = await t.update(id, { ...patch, updatedAt: nowISO(), dirty: 1 } as never)
  if (n === 0) {
    const exists = await t.get(id)
    if (!exists) throw new Error(`No existe el registro ${id}`)
  }
  notifyChange()
}

export async function softDelete(table: SyncTable, id: string): Promise<void> {
  await update(table, id, { deletedAt: nowISO() } as never)
}

export const alive = <T extends Base>(r: T | undefined | null): r is T => !!r && !r.deletedAt

// Aviso para el motor de sync (sin dependencia circular).
type Listener = () => void
const listeners = new Set<Listener>()
export function onLocalChange(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notifyChange() {
  // Fuera de la transacción actual: si un listener lee la base dentro de la
  // transacción sin que ésta lo espere, IndexedDB la cierra antes de tiempo.
  Dexie.ignoreTransaction(() => setTimeout(() => listeners.forEach((fn) => fn()), 0))
}
