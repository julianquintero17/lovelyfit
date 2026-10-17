// Fechas "de calendario" del usuario (YYYY-MM-DD) calculadas en su zona horaria,
// nunca en UTC: entrenar a las 23:30 en Buenos Aires cuenta para ese día.

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'

export type DayKey = string // 'YYYY-MM-DD'

export function dayKey(d: Date = new Date(), tz: string = DEFAULT_TZ): DayKey {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function timeHM(d: Date = new Date(), tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

// Aritmética sobre días de calendario: se opera en UTC sobre la fecha "pura".
function toUTC(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function fromUTC(d: Date): DayKey {
  return d.toISOString().slice(0, 10)
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = toUTC(k)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUTC(d)
}

/** 0 = domingo … 6 = sábado */
export function weekday(k: DayKey): number {
  return toUTC(k).getUTCDay()
}

/** Semana lunes–domingo que contiene k. */
export function weekStart(k: DayKey): DayKey {
  const wd = weekday(k)
  return addDays(k, wd === 0 ? -6 : 1 - wd)
}

export function weekDays(k: DayKey): DayKey[] {
  const s = weekStart(k)
  return Array.from({ length: 7 }, (_, i) => addDays(s, i))
}

export function monthStart(k: DayKey): DayKey {
  return k.slice(0, 8) + '01'
}

export function monthEnd(k: DayKey): DayKey {
  const d = toUTC(monthStart(k))
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return fromUTC(d)
}

export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000)
}

export function inRange(k: DayKey, from: DayKey, to: DayKey): boolean {
  return k >= from && k <= to
}

const WD_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WD_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const weekdayShort = (wd: number) => WD_SHORT[wd]
export const weekdayLong = (wd: number) => WD_LONG[wd]

export function fmtDay(k: DayKey): string {
  const [, m, d] = k.split('-').map(Number)
  return `${WD_SHORT[weekday(k)]} ${d} ${MONTHS[m - 1]}`
}

export function fmtShort(k: DayKey): string {
  const [, m, d] = k.split('-').map(Number)
  return `${d}/${m}`
}

export function fmtMonth(k: DayKey): string {
  const [y, m] = k.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** "hoy", "ayer", "hace 3 días" — para mostrar antigüedad de un dato. */
export function relativeDay(k: DayKey, today: DayKey): string {
  const n = daysBetween(k, today)
  if (n === 0) return 'hoy'
  if (n === 1) return 'ayer'
  if (n < 0) return fmtDay(k)
  return `hace ${n} días`
}

export function isValidDayKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return fromUTC(toUTC(s)) === s
}
