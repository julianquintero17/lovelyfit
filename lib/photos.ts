import { getDB, insert, uuid } from './db'
import { dayKey } from './dates'
import type { Photo, PhotoKind } from './types'

/** Reduce a ≤1280 px de lado mayor y JPEG ~0,75 para no llenar el almacenamiento. */
export async function compressImage(file: Blob, maxSide = 1280, quality = 0.75): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
  if (!blob) throw new Error('No se pudo comprimir la imagen')
  return { blob, width, height }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    } catch {
      /* Safari viejo: cae al <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Guarda la foto comprimida localmente. Devuelve el id o lanza error. */
export async function savePhoto(file: Blob, kind: PhotoKind, note = '', date = dayKey()): Promise<Photo> {
  const { blob, width, height } = await compressImage(file)
  const db = getDB()
  const id = uuid()
  return db.transaction('rw', db.photos, db.photoBlobs, db.meta, async () => {
    await db.photoBlobs.put({ id, blob })
    return insert<Photo>('photos', { id, kind, date, mime: 'image/jpeg', width, height, bytes: blob.size, storagePath: null, note })
  })
}

export async function photoURL(id: string): Promise<string | null> {
  const row = await getDB().photoBlobs.get(id)
  return row ? URL.createObjectURL(row.blob) : null
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null
  const e = await navigator.storage.estimate()
  const persisted = (await navigator.storage.persisted?.()) ?? false
  return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted }
}

/** Pide al navegador que no borre los datos por falta de espacio (no es garantía). */
export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false
}
