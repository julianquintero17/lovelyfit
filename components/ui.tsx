'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './Icons'

// ---- Estado de guardado ----------------------------------------------------
// Un único lugar que dice la verdad: solo informa "guardado" cuando la
// escritura en IndexedDB resolvió.

type SaveState = { kind: 'idle' | 'ok' | 'err'; at: number; msg: string }
let saveState: SaveState = { kind: 'idle', at: 0, msg: '' }
const saveSubs = new Set<() => void>()
function setSave(s: SaveState) {
  saveState = s
  saveSubs.forEach((f) => f())
}
export function useSaveState() {
  return useSyncExternalStore(
    (cb) => {
      saveSubs.add(cb)
      return () => saveSubs.delete(cb)
    },
    () => saveState,
    () => saveState,
  )
}

/**
 * Ejecuta una escritura y reporta el resultado real.
 * `toast`: mensaje visible al terminar bien (si se omite, solo actualiza el indicador).
 */
export async function persist<T>(fn: () => Promise<T>, toast?: string): Promise<{ ok: true; value: T } | { ok: false; value?: undefined }> {
  try {
    const value = await fn()
    setSave({ kind: 'ok', at: Date.now(), msg: toast ?? 'Guardado en el teléfono' })
    if (toast) showToast(toast)
    return { ok: true, value }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const name = e instanceof Error ? e.name : ''
    console.error(e)
    const msg = /Quota/i.test(name + raw)
      ? 'el teléfono se quedó sin espacio para la app. Exportá un respaldo y borrá fotos viejas.'
      : raw
    setSave({ kind: 'err', at: Date.now(), msg })
    showToast(`No se pudo guardar: ${msg}`, true)
    return { ok: false }
  }
}

// ---- Toast ----------------------------------------------------------------

type ToastMsg = { id: number; text: string; err: boolean }
let toast: ToastMsg | null = null
const toastSubs = new Set<() => void>()
export function showToast(text: string, err = false) {
  toast = { id: Date.now(), text, err }
  toastSubs.forEach((f) => f())
}
export function Toaster() {
  const t = useSyncExternalStore(
    (cb) => {
      toastSubs.add(cb)
      return () => toastSubs.delete(cb)
    },
    () => toast,
    () => null,
  )
  const [visible, setVisible] = useState<ToastMsg | null>(null)
  useEffect(() => {
    if (!t) return
    setVisible(t)
    const h = setTimeout(() => setVisible(null), t.err ? 5000 : 2200)
    return () => clearTimeout(h)
  }, [t])
  if (!visible) return null
  return (
    <div className={`toast${visible.err ? ' err' : ''}`} role={visible.err ? 'alert' : 'status'}>
      {visible.text}
    </div>
  )
}

// ---- Hoja modal ---------------------------------------------------------------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // onClose suele ser una función nueva en cada render: guardarla en un ref evita
  // re-ejecutar el efecto (y robar el foco del input mientras se escribe).
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    const bg = [document.querySelector('main'), document.querySelector('nav.bottomnav'), document.querySelector('header.topbar')]
    bg.forEach((el) => el?.setAttribute('inert', ''))
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      bg.forEach((el) => el?.removeAttribute('inert'))
      document.body.style.overflow = ''
      opener?.focus?.()
    }
  }, [open])
  if (!open) return null
  // Portal al body: la hoja no puede quedar dentro de <main>, que se marca inerte
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar"><IconClose /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ---- Anillo de progreso ------------------------------------------------------

export function Ring({ value, max, children, size = 96, light = false }: { value: number; max: number; children?: ReactNode; size?: number; light?: boolean }) {
  const r = 42
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke={light ? 'rgba(254,248,239,.25)' : 'var(--offwhite)'} strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={light ? 'var(--cream)' : 'var(--lab)'} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="center">{children}</div>
    </div>
  )
}

// ---- Gráfico de línea simple (SVG, sin dependencias) -------------------------

export function LineChart({ points, unit, height = 140, label }: { points: { x: string; y: number }[]; unit: string; height?: number; label: string }) {
  if (points.length === 0) return <p className="empty small">Sin datos todavía.</p>
  const W = 320
  const H = height
  const pad = { l: 36, r: 10, t: 12, b: 22 }
  const ys = points.map((p) => p.y)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  min -= span * 0.1
  max += span * 0.1
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1))
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1).replace('.', ','))
  const last = points[points.length - 1]
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label}: último ${fmt(last.y)} ${unit}`}>
        {[0, 0.5, 1].map((t) => {
          const v = min + (max - min) * (1 - t)
          const yy = pad.t + t * (H - pad.t - pad.b)
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="var(--stone)" strokeWidth="0.75" strokeDasharray="2 3" />
              <text x={pad.l - 6} y={yy + 4} fontSize="10" textAnchor="end" fill="var(--ink-2)">{fmt(v)}</text>
            </g>
          )
        })}
        <path d={d} fill="none" stroke="var(--lab)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.y)} r={i === points.length - 1 ? 4.5 : 3} fill={i === points.length - 1 ? 'var(--clay)' : 'var(--lab)'} stroke="var(--surface)" strokeWidth="1.5" />
        ))}
        <text x={pad.l} y={H - 4} fontSize="10" fill="var(--ink-2)">{points[0].x}</text>
        {points.length > 1 && <text x={W - pad.r} y={H - 4} fontSize="10" textAnchor="end" fill="var(--ink-2)">{last.x}</text>}
      </svg>
    </figure>
  )
}

// ---- Barras por día de la semana ----------------------------------------------

export function WeekBars({ days, label }: { days: { label: string; value: number | null; today?: boolean }[]; label: string }) {
  const max = Math.max(1, ...days.map((d) => d.value ?? 0))
  return (
    <div role="img" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, alignItems: 'end', height: 92 }}>
      {days.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          {d.value == null ? (
            <div title="sin datos" style={{ width: '70%', height: 4, borderTop: '2px dotted var(--stone)' }} />
          ) : (
            d.value === 0
              ? <div title="cero" style={{ width: '70%', height: 6, border: '1.5px solid var(--lab)', borderRadius: 6 }} />
              : <div style={{ width: '70%', height: `${Math.max(4, (d.value / max) * 64)}px`, background: d.today ? 'var(--clay)' : 'var(--lab)', borderRadius: 6 }} />
          )}
          <span className="tiny" style={{ color: d.today ? 'var(--clay-ink)' : 'var(--ink-2)', fontWeight: d.today ? 700 : 500 }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function useNumberField(initial: number | null) {
  const [text, setText] = useState(initial == null ? '' : String(initial).replace('.', ','))
  const value = text.trim() === '' ? null : Number(text.replace(',', '.'))
  return { text, setText, value: value != null && Number.isFinite(value) ? value : null, invalid: text.trim() !== '' && !Number.isFinite(Number(text.replace(',', '.'))) }
}

export function parseNum(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function useStableCallback<T extends (...a: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback(((...a: never[]) => ref.current(...a)) as T, [])
}
