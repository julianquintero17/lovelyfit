'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getDB } from './db'
import { dayKey, DEFAULT_TZ } from './dates'
import { getSyncStatus, subscribeSync } from './sync'
import { photoURL } from './photos'
import type { Base, Profile, SyncTable } from './types'

/** Filas vivas (no borradas) de una tabla, reactivas a cambios. */
export function useRows<T extends Base>(table: SyncTable, deps: unknown[] = []): T[] | undefined {
  return useLiveQuery(async () => ((await getDB()[table].toArray()) as unknown as T[]).filter((r) => !r.deletedAt), deps)
}

export function useProfile(): { profile: Profile | null | undefined } {
  const profile = useLiveQuery(async () => {
    const all = (await getDB().profiles.toArray()).filter((p) => !p.deletedAt)
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return all[0] ?? null
  }, [])
  return { profile }
}

/** Fecha de hoy en la zona del perfil; se actualiza si la app queda abierta pasada la medianoche. */
export function useToday(tz: string = DEFAULT_TZ) {
  const [today, setToday] = useState(() => dayKey(new Date(), tz))
  useEffect(() => {
    const tick = () => setToday(dayKey(new Date(), tz))
    tick()
    const h = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(h)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [tz])
  return today
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus)
}

export function usePhotoURL(id: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoke: string | null = null
    let alive = true
    if (id) {
      photoURL(id).then((u) => {
        if (!alive) {
          if (u) URL.revokeObjectURL(u)
          return
        }
        revoke = u
        setUrl(u)
      })
    } else setUrl(null)
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [id])
  return url
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb)
      window.addEventListener('offline', cb)
      return () => {
        window.removeEventListener('online', cb)
        window.removeEventListener('offline', cb)
      }
    },
    () => navigator.onLine,
    () => true,
  )
}
