import { getDB, getMeta, onLocalChange, setMeta, SYNC_TABLES } from './db'
import { PHOTO_BUCKET, supabase } from './supabase'
import type { Base, Photo, SyncTable } from './types'

// Sincronización local-first:
//  - Cada cambio local queda con dirty=1 (cola persistente en IndexedDB).
//  - push: upsert por id (UUID del cliente) → reintentar nunca duplica.
//  - El servidor ignora una escritura más vieja que la que ya tiene (trigger LWW).
//  - pull: trae filas con server_updated_at posterior al último cursor.
//  - Solo corre con la app abierta y con conexión; iOS no garantiza segundo plano.

export const REMOTE_TABLE: Record<SyncTable, string> = {
  profiles: 'fit_profiles',
  exercises: 'fit_exercises',
  plans: 'fit_plans',
  planDays: 'fit_plan_days',
  sessions: 'fit_sessions',
  sessionExercises: 'fit_session_exercises',
  sets: 'fit_sets',
  activities: 'fit_activities',
  mealTemplates: 'fit_meal_templates',
  meals: 'fit_meals',
  measurements: 'fit_measurements',
  dailyMetrics: 'fit_daily_metrics',
  habits: 'fit_habits',
  habitLogs: 'fit_habit_logs',
  photos: 'fit_photos',
  reminders: 'fit_reminders',
}

const LOCAL_ONLY = new Set(['dirty'])

export const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
export const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

export function toRow(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) if (!LOCAL_ONLY.has(k)) out[toSnake(k)] = v
  return out
}

export function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (k !== 'server_updated_at') out[toCamel(k)] = v
  out.dirty = 0
  return out
}

/** Decide qué versión queda cuando llega una fila remota. */
export function resolveIncoming(local: Base | undefined, remote: Base): 'take' | 'keep' {
  if (!local) return 'take'
  if (!local.dirty) return 'take'
  return remote.updatedAt > local.updatedAt ? 'take' : 'keep'
}

// ---- Estado observable --------------------------------------------------

export type SyncState = 'local-only' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error'
export interface SyncStatus {
  state: SyncState
  pending: number
  lastSyncAt: string | null
  error: string | null
  email: string | null
}

let status: SyncStatus = { state: 'local-only', pending: 0, lastSyncAt: null, error: null, email: null }
const subs = new Set<(s: SyncStatus) => void>()
export const getSyncStatus = () => status
export function subscribeSync(fn: (s: SyncStatus) => void) {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p }
  subs.forEach((f) => f(status))
}

export async function countPending(): Promise<number> {
  const db = getDB()
  let n = 0
  for (const t of SYNC_TABLES) n += await db[t].where('dirty').equals(1).count()
  return n
}

// ---- Motor -------------------------------------------------------------

let running: Promise<void> | null = null
let again = false

export function requestSync() {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await syncOnce()
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

async function syncOnce() {
  const sb = supabase()
  const pending = await countPending()
  if (!sb) return setStatus({ state: 'local-only', pending })
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user) return setStatus({ state: 'signed-out', pending, email: null })
  if (typeof navigator !== 'undefined' && !navigator.onLine) return setStatus({ state: 'offline', pending, email: user.email ?? null })

  setStatus({ state: 'syncing', pending, email: user.email ?? null })
  try {
    await uploadPhotos(user.id)
    await push(user.id)
    await pull()
    setStatus({ state: 'idle', pending: await countPending(), lastSyncAt: new Date().toISOString(), error: null })
    await setMeta('lastSyncAt', new Date().toISOString())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setStatus({ state: navigator.onLine ? 'error' : 'offline', pending: await countPending(), error: msg })
  }
}

async function push(userId: string) {
  const sb = supabase()!
  const db = getDB()
  for (const t of SYNC_TABLES) {
    const dirty = (await db[t].where('dirty').equals(1).toArray()) as Base[]
    const mine = dirty.filter((r) => r.ownerId === userId)
    for (let i = 0; i < mine.length; i += 200) {
      const batch = mine.slice(i, i + 200)
      const { error } = await sb.from(REMOTE_TABLE[t]).upsert(batch.map((r) => toRow(r as never)), { onConflict: 'id' })
      if (error) throw new Error(`${REMOTE_TABLE[t]}: ${error.message}`)
      // Solo se limpia si nadie editó el registro mientras subía.
      await db.transaction('rw', db[t], async () => {
        for (const r of batch) {
          const cur = (await db[t].get(r.id)) as Base | undefined
          if (cur && cur.updatedAt === r.updatedAt) await db[t].update(r.id, { dirty: 0 } as never)
        }
      })
    }
  }
}

async function pull() {
  const sb = supabase()!
  const db = getDB()
  for (const t of SYNC_TABLES) {
    const cursorKey = `pull:${t}`
    let cursor = (await getMeta<string>(cursorKey)) ?? '1970-01-01T00:00:00Z'
    for (;;) {
      const { data, error } = await sb
        .from(REMOTE_TABLE[t])
        .select('*')
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(500)
      if (error) throw new Error(`${REMOTE_TABLE[t]}: ${error.message}`)
      if (!data?.length) break
      await db.transaction('rw', db[t], async () => {
        for (const row of data) {
          const remote = fromRow(row) as unknown as Base
          const local = (await db[t].get(remote.id)) as Base | undefined
          if (resolveIncoming(local, remote) === 'take') await db[t].put(remote as never)
        }
      })
      cursor = data[data.length - 1].server_updated_at as string
      await setMeta(cursorKey, cursor)
      if (data.length < 500) break
    }
  }
}

async function uploadPhotos(userId: string) {
  const sb = supabase()!
  const db = getDB()
  const photos = (await db.photos.toArray()).filter((p) => p.ownerId === userId && !p.storagePath && !p.deletedAt)
  for (const p of photos) {
    const blob = (await db.photoBlobs.get(p.id))?.blob
    if (!blob) continue
    const path = `${userId}/${p.id}.jpg`
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: p.mime, upsert: true })
    if (error) throw new Error(`fotos: ${error.message}`)
    await db.photos.update(p.id, { storagePath: path, updatedAt: new Date().toISOString(), dirty: 1 } as Partial<Photo>)
  }
}

/** Descarga una foto que existe en la nube pero no en este dispositivo. */
export async function fetchRemotePhoto(p: Photo): Promise<Blob | null> {
  const sb = supabase()
  if (!sb || !p.storagePath) return null
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).download(p.storagePath)
  if (error || !data) return null
  await getDB().photoBlobs.put({ id: p.id, blob: data })
  return data
}

// ---- Cuenta --------------------------------------------------------------

/**
 * Al iniciar sesión, los registros creados sin cuenta pasan a ser del usuario.
 * Se marcan dirty para subirlos.
 */
export async function adoptLocalData(userId: string) {
  const db = getDB()
  const prev = await getMeta<string>('ownerId')
  await db.transaction('rw', db.tables, async () => {
    for (const t of SYNC_TABLES) {
      const rows = (await db[t].toArray()) as Base[]
      for (const r of rows) {
        if (r.ownerId !== userId && (r.ownerId.startsWith('local-') || r.ownerId === prev)) {
          await db[t].update(r.id, { ownerId: userId, dirty: 1 } as never)
        }
      }
    }
    await db.meta.put({ key: 'ownerId', value: userId })
  })
}

export async function sendLoginCode(email: string) {
  const sb = supabase()
  if (!sb) throw new Error('La nube no está configurada.')
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export async function verifyLoginCode(email: string, token: string) {
  const sb = supabase()
  if (!sb) throw new Error('La nube no está configurada.')
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
  if (data.user) await adoptLocalData(data.user.id)
  await requestSync()
}

export async function signOut() {
  await supabase()?.auth.signOut()
  await requestSync()
}

// ---- Arranque ------------------------------------------------------------

let started = false
export function startSyncLoop() {
  if (started || typeof window === 'undefined') return
  started = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = () => {
    countPending().then((pending) => setStatus({ pending }))
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => requestSync(), 1500)
  }
  onLocalChange(debounced)
  window.addEventListener('online', () => requestSync())
  window.addEventListener('offline', () => setStatus({ state: supabase() ? 'offline' : 'local-only' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSync()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') requestSync()
  }, 60_000)
  getMeta<string>('lastSyncAt').then((v) => v && setStatus({ lastSyncAt: v }))
  requestSync()
}
