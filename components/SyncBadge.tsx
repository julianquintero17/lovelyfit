'use client'

import Link from 'next/link'
import { useSyncStatus } from '@/lib/hooks'

/** Estado honesto: dónde están los datos ahora mismo. */
export function SyncBadge() {
  const s = useSyncStatus()
  const map = {
    'local-only': { cls: 'neutral', text: 'Solo en este teléfono' },
    'signed-out': { cls: 'neutral', text: 'Sin cuenta' },
    idle: { cls: s.pending ? 'warn' : 'ok', text: s.pending ? `${s.pending} por subir` : 'Sincronizado' },
    syncing: { cls: 'neutral', text: 'Sincronizando…' },
    offline: { cls: 'warn', text: s.pending ? `Sin conexión · ${s.pending} pendientes` : 'Sin conexión' },
    error: { cls: 'err', text: 'Sin sincronizar' },
    'no-access': { cls: 'err', text: 'Acceso pausado' },
  } as const
  const m = map[s.state]
  return (
    <Link href="/datos/#cuenta" className={`badge ${m.cls}`} style={{ textDecoration: 'none' }} data-testid="sync-badge" data-state={s.state}>
      <span className="dot" aria-hidden />
      {m.text}
    </Link>
  )
}
