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

export type SyncState = 'local-only' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error' | 'no-access'
export interface Membership {
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  plan: string
}
export interface SyncStatus {
  state: SyncState
  pending: number
  lastSyncAt: string | null
  /** Mensaje para el usuario (no técnico). */
  error: string | null
  /** Tablas que no se pudieron subir en el último intento. */
  failedTables: string[]
  email: string | null
  membership: Membership | null
}

let status: SyncStatus = { state: 'local-only', pending: 0, lastSyncAt: null, error: null, failedTables: [], email: null, membership: null }
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

/** Traduce errores técnicos a algo entendible; el detalle queda en la consola. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  console.warn('sync:', msg)
  if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) return 'No hay conexión con la nube. Tus datos siguen guardados en el teléfono.'
  if (/JWT|token|session/i.test(msg)) return 'Tu sesión venció. Volvé a entrar desde Mis datos.'
  if (/row-level security|permission|42501/i.test(msg)) return 'La nube rechazó algunos datos (permisos). Siguen guardados en el teléfono.'
  return 'No se pudo sincronizar todo. Tus datos siguen guardados en el teléfono; reintentamos solos.'
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

async function claimMembership(): Promise<(Membership & { profile: Record<string, unknown> | null }) | null> {
  const { data, error } = await supabase()!.rpc('fit_claim')
  if (error) throw error
  return (data as (Membership & { profile: Record<string, unknown> | null }) | null) ?? null
}

async function syncOnce() {
  const sb = supabase()
  const pending = await countPending()
  if (!sb) return setStatus({ state: 'local-only', pending })
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user) return setStatus({ state: 'signed-out', pending, email: null, membership: null })
  if (typeof navigator !== 'undefined' && !navigator.onLine) return setStatus({ state: 'offline', pending, email: user.email ?? null })

  setStatus({ state: 'syncing', pending, email: user.email ?? null })
  try {
    const m = await claimMembership()
    const membership = m ? { role: m.role, status: m.status, plan: m.plan } : null
    await setMeta('membership', membership)
    if (!membership || membership.status !== 'active') {
      return setStatus({ state: 'no-access', membership, error: 'Tu acceso está pausado. Tus datos siguen en este teléfono.' })
    }
    setStatus({ membership })
    const failed: string[] = []
    await syncPhotos(user.id).catch((e) => {
      friendlyError(e)
      failed.push('fotos')
    })
    failed.push(...(await push(user.id)))
    await pull(user.id)
    const now = new Date().toISOString()
    setStatus({
      state: failed.length ? 'error' : 'idle',
      pending: await countPending(),
      lastSyncAt: now,
      failedTables: failed,
      error: failed.length ? 'Algunos datos no se pudieron subir. Siguen guardados en el teléfono; reintentamos solos.' : null,
    })
    await setMeta('lastSyncAt', now)
  } catch (e) {
    setStatus({ state: navigator.onLine ? 'error' : 'offline', pending: await countPending(), error: friendlyError(e) })
  }
}

/** Sube por tabla; si una falla, sigue con las demás. Devuelve las tablas con error. */
async function push(userId: string): Promise<string[]> {
  const sb = supabase()!
  const db = getDB()
  const failed: string[] = []
  for (const t of SYNC_TABLES) {
    const dirty = (await db[t].where('dirty').equals(1).toArray()) as Base[]
    const mine = dirty.filter((r) => r.ownerId === userId)
    try {
      for (let i = 0; i < mine.length; i += 200) {
        const batch = mine.slice(i, i + 200)
        const { data, error } = await sb.from(REMOTE_TABLE[t]).upsert(batch.map((r) => toRow(r as never)), { onConflict: 'id' }).select('id')
        if (error) throw new Error(`${REMOTE_TABLE[t]}: ${error.message}`)
        // Filas que el servidor ignoró por ser más viejas (LWW): traer la versión del servidor.
        const applied = new Set((data ?? []).map((r) => r.id as string))
        const stale = batch.filter((r) => !applied.has(r.id)).map((r) => r.id)
        const newer = stale.length ? (await sb.from(REMOTE_TABLE[t]).select('*').in('id', stale)).data ?? [] : []
        await db.transaction('rw', db[t], async () => {
          for (const r of batch) {
            const cur = (await db[t].get(r.id)) as Base | undefined
            if (cur && cur.updatedAt === r.updatedAt) await db[t].update(r.id, { dirty: 0 } as never)
          }
          for (const row of newer) await db[t].put(fromRow(row) as never)
        })
      }
    } catch (e) {
      friendlyError(e)
      failed.push(REMOTE_TABLE[t])
    }
  }
  return failed
}

async function pull(userId: string) {
  const sb = supabase()!
  const db = getDB()
  for (const t of SYNC_TABLES) {
    const cursorKey = `pull:${userId}:${t}`
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

/** Sube fotos nuevas y elimina de la nube las que se borraron. */
async function syncPhotos(userId: string) {
  const sb = supabase()!
  const db = getDB()
  const photos = (await db.photos.toArray()).filter((p) => p.ownerId === userId)
  for (const p of photos.filter((p) => p.deletedAt && p.storagePath)) {
    const { error } = await sb.storage.from(PHOTO_BUCKET).remove([p.storagePath!])
    if (error) throw error
    await db.photos.update(p.id, { storagePath: null, updatedAt: new Date().toISOString(), dirty: 1 } as Partial<Photo>)
    await db.photoBlobs.delete(p.id)
  }
  for (const p of photos.filter((p) => !p.storagePath && !p.deletedAt)) {
    const blob = (await db.photoBlobs.get(p.id))?.blob
    if (!blob) continue
    const path = `${userId}/${p.id}.jpg`
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: p.mime, upsert: true })
    if (error) throw error
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
 * Al iniciar sesión, SOLO los registros creados sin cuenta ("local-…") pasan a
 * ser del usuario. Nunca se reasignan datos de otra cuenta.
 */
export async function adoptLocalData(userId: string) {
  const db = getDB()
  await db.transaction('rw', db.tables, async () => {
    for (const t of SYNC_TABLES) {
      const rows = (await db[t].toArray()) as Base[]
      for (const r of rows) {
        if (r.ownerId.startsWith('local-')) await db[t].update(r.id, { ownerId: userId, dirty: 1 } as never)
      }
    }
    await db.meta.put({ key: 'ownerId', value: userId })
  })
}

/** ¿Hay en este teléfono datos de otra cuenta? Entonces no se puede entrar con otra sin borrarlos. */
export async function otherAccountOnDevice(userId?: string): Promise<boolean> {
  const owner = await getMeta<string>('ownerId')
  return !!owner && !owner.startsWith('local-') && owner !== userId
}

export async function sendLoginCode(email: string) {
  const sb = supabase()
  if (!sb) throw new Error('La nube no está configurada.')
  const clean = email.trim().toLowerCase()
  const { data: allowed, error: e1 } = await sb.rpc('fit_can_sign_in', { p_email: clean })
  if (e1) throw new Error('No pudimos verificar el acceso. Revisá la conexión.')
  if (!allowed) throw new Error('Este email todavía no tiene acceso. Pedile una invitación al administrador.')
  const { error } = await sb.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } })
  if (error) throw new Error(/rate|seconds/i.test(error.message) ? 'Pediste muchos códigos seguidos. Esperá un minuto.' : error.message)
}

export async function verifyLoginCode(email: string, token: string) {
  const sb = supabase()
  if (!sb) throw new Error('La nube no está configurada.')
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' })
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'El código no es válido o venció. Pedí uno nuevo.' : error.message)
  const user = data.user
  if (!user) throw new Error('No se pudo iniciar sesión.')
  if (await otherAccountOnDevice(user.id)) {
    await sb.auth.signOut()
    throw new Error('Este teléfono tiene datos de otra cuenta. Cerrá esa sesión desde Mis datos antes de entrar con otra.')
  }
  const m = await claimMembership()
  if (!m || m.status !== 'active') {
    await sb.auth.signOut()
    throw new Error(m ? 'Tu acceso está pausado.' : 'Este email no tiene una invitación activa.')
  }
  await setMeta('membership', { role: m.role, status: m.status, plan: m.plan })
  await adoptLocalData(user.id)
  await requestSync()
  // Primera vez sin datos en la nube ni en el teléfono: crear el perfil con los datos de la invitación
  if ((await getDB().profiles.count()) === 0) {
    const { seedFor } = await import('./seed')
    await seedFor((m.profile ?? {}) as never)
    await requestSync()
  }
}

/**
 * Cerrar sesión borra los datos de este teléfono (quedan en la cuenta).
 * Si hay cambios sin subir, no deja salir salvo que se fuerce.
 */
export async function signOut(force = false) {
  await requestSync()
  const pending = await countPending()
  if (pending > 0 && !force) throw new Error(`Hay ${pending} cambios sin subir. Conectate y sincronizá antes de cerrar sesión, o exportá un respaldo.`)
  await supabase()?.auth.signOut()
  const db = getDB()
  await db.delete()
  await db.open()
  setStatus({ state: 'signed-out', pending: 0, email: null, membership: null, lastSyncAt: null, failedTables: [], error: null })
}

// ---- Arranque ------------------------------------------------------------

let started = false
export function startSyncLoop() {
  if (started || typeof window === 'undefined') return
  started = true
  let timer: ReturnType<typeof setTimeout> | null = null
  // Agrupar: muchas escrituras seguidas (ej. tipear kg) = un solo conteo y una sola sync
  const debounced = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      countPending().then((pending) => setStatus({ pending }))
      requestSync()
    }, 1500)
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
  getMeta<Membership>('membership').then((m) => m && setStatus({ membership: m }))
  requestSync()
}
