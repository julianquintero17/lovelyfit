'use client'

import { useEffect, useState } from 'react'
import { getDB } from '@/lib/db'
import { fetchRemotePhoto } from '@/lib/sync'
import { savePhoto } from '@/lib/photos'
import type { Photo, PhotoKind } from '@/lib/types'
import { IconCamera } from './Icons'
import { showToast } from './ui'

/** Muestra una foto local; si solo está en la nube, la descarga (privada, con sesión). */
export function PhotoImg({ id, alt, className, style }: { id: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let u: string | null = null
    let alive = true
    ;(async () => {
      const db = getDB()
      let blob = (await db.photoBlobs.get(id))?.blob
      if (!blob) {
        const row = await db.photos.get(id)
        if (row) blob = (await fetchRemotePhoto(row)) ?? undefined
      }
      if (!alive) return
      if (blob) {
        u = URL.createObjectURL(blob)
        setUrl(u)
      } else setMissing(true)
    })()
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [id])
  if (missing) return <div className={className} style={{ ...style, display: 'grid', placeItems: 'center', background: 'var(--offwhite)' }} title="Foto no disponible en este dispositivo"><span className="tiny muted">sin foto</span></div>
  if (!url) return <div className={className} style={{ ...style, background: 'var(--offwhite)' }} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} style={style} />
}

/** Botón para sacar/elegir foto. Comprime y guarda local antes de avisar. */
export function PhotoButton({ kind, onSaved, label = 'Foto', date }: { kind: PhotoKind; onSaved: (p: Photo) => void; label?: string; date?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <label className="btn quiet sm" style={{ cursor: busy ? 'wait' : 'pointer' }} aria-busy={busy}>
      <IconCamera width={18} /> {busy ? 'Guardando…' : label}
      <input type="file" accept="image/*" hidden disabled={busy} onChange={async (e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        setBusy(true)
        try {
          const p = await savePhoto(f, kind, '', date)
          onSaved(p)
        } catch (err) {
          showToast(`No se pudo guardar la foto: ${err instanceof Error ? err.message : err}`, true)
        } finally {
          setBusy(false)
        }
      }} />
    </label>
  )
}
