import { getDB, SYNC_TABLES } from './db'
import type { Base } from './types'

// Respaldo completo en JSON. El almacenamiento del navegador puede borrarse
// (Safari lo hace con sitios sin uso), así que conviene exportar seguido.

export interface BackupFile {
  app: 'lovely-fit'
  version: 1
  exportedAt: string
  tables: Record<string, Base[]>
  photos?: Record<string, string> // id -> dataURL
}

export async function exportBackup(includePhotos: boolean): Promise<Blob> {
  const db = getDB()
  const tables: Record<string, Base[]> = {}
  for (const t of SYNC_TABLES) tables[t] = (await db[t].toArray()) as Base[]
  const out: BackupFile = { app: 'lovely-fit', version: 1, exportedAt: new Date().toISOString(), tables }
  if (includePhotos) {
    out.photos = {}
    for (const p of await db.photoBlobs.toArray()) out.photos[p.id] = await blobToDataURL(p.blob)
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' })
}

/**
 * Importa un respaldo fusionando por id: gana el registro con updatedAt más
 * reciente. Reimportar el mismo archivo no duplica nada.
 */
export async function importBackup(text: string): Promise<{ inserted: number; updated: number; skipped: number }> {
  const data = JSON.parse(text) as BackupFile
  if (data.app !== 'lovely-fit' || data.version !== 1 || typeof data.tables !== 'object') {
    throw new Error('El archivo no es un respaldo de Lovely Fit.')
  }
  const db = getDB()
  const ownerId = (await db.meta.get('ownerId'))?.value as string | undefined
  let inserted = 0, updated = 0, skipped = 0
  // Decodificar fotos ANTES de la transacción: esperar algo que no es IndexedDB la cerraría.
  const blobs = await Promise.all(Object.entries(data.photos ?? {}).map(async ([id, url]) => ({ id, blob: await (await fetch(url)).blob() })))
  await db.transaction('rw', db.tables, async () => {
    for (const t of SYNC_TABLES) {
      for (const row of data.tables[t] ?? []) {
        if (!row?.id || !row.updatedAt) { skipped++; continue }
        const incoming = { ...row, ownerId: ownerId ?? row.ownerId, dirty: 1 as const }
        const cur = (await db[t].get(row.id)) as Base | undefined
        if (!cur) { await db[t].put(incoming as never); inserted++ }
        else if (row.updatedAt > cur.updatedAt) { await db[t].put(incoming as never); updated++ }
        else skipped++
      }
    }
    for (const b of blobs) if (!(await db.photoBlobs.get(b.id))) await db.photoBlobs.put(b)
  })
  return { inserted, updated, skipped }
}

/** Borra todo lo local. No toca la nube. */
export async function wipeLocal() {
  const db = getDB()
  await db.delete()
  await db.open()
}

function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })
}
